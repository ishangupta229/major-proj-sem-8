from pathlib import Path
from typing import Literal

import joblib
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field


BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "model.pkl"
FRONTEND_DIR = BASE_DIR.parent / "frontend"
DATASET_NAME = "merged_cardiac_training_dataset.csv"


class SensorPayload(BaseModel):
    age: float = Field(..., ge=1, le=120)
    sex: float = Field(..., ge=0, le=1)
    heart_rate: float
    respiratory_rate: float
    spo2: float
    pulse_rate: float
    body_temperature: float
    hrv_rmssd: float
    hrv_sdnn: float
    activity_level: float
    camera_heart_rate: float
    camera_hrv: float
    respiration_rate_camera: float
    stress_score: float
    fatigue_score: float
    estimated_age: float
    skin_perfusion_index: float


class PredictionResponse(BaseModel):
    probability: float
    risk_level: Literal["Low", "Medium", "High"]


app = FastAPI(title="Real-Time Cardiac Risk API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_model_bundle = None
_dataset_df = None


def load_bundle():
    global _model_bundle
    if _model_bundle is None:
        if not MODEL_PATH.exists():
            raise FileNotFoundError(
                f"Model file not found at {MODEL_PATH}. Run train_model.py first."
            )
        _model_bundle = joblib.load(MODEL_PATH)
    return _model_bundle


def resolve_dataset_path() -> Path:
    candidates = [
        BASE_DIR.parent / DATASET_NAME,
        BASE_DIR.parent.parent / DATASET_NAME,
        BASE_DIR / DATASET_NAME,
    ]

    for path in candidates:
        if path.exists():
            return path

    raise FileNotFoundError(
        f"Dataset not found. Expected one of: {', '.join(str(p) for p in candidates)}"
    )


def load_dataset() -> pd.DataFrame:
    global _dataset_df
    if _dataset_df is None:
        path = resolve_dataset_path()
        _dataset_df = pd.read_csv(path)
        _dataset_df.columns = [c.strip().lower() for c in _dataset_df.columns]
    return _dataset_df


def apply_dataset_filters(
    df: pd.DataFrame,
    sex: str | None = None,
    min_age: float | None = None,
    max_age: float | None = None,
    risk: str | None = None,
) -> pd.DataFrame:
    filtered = df.copy()

    if "age" in filtered.columns:
        filtered["age"] = pd.to_numeric(filtered["age"], errors="coerce")
    if "sex" in filtered.columns:
        filtered["sex"] = pd.to_numeric(filtered["sex"], errors="coerce")
    if "heart_disease" in filtered.columns:
        filtered["heart_disease"] = pd.to_numeric(filtered["heart_disease"], errors="coerce")

    if sex and sex.lower() in {"male", "female"} and "sex" in filtered.columns:
        sex_value = 1 if sex.lower() == "male" else 0
        filtered = filtered[filtered["sex"] == sex_value]

    if min_age is not None and "age" in filtered.columns:
        filtered = filtered[filtered["age"] >= float(min_age)]

    if max_age is not None and "age" in filtered.columns:
        filtered = filtered[filtered["age"] <= float(max_age)]

    if risk and "heart_disease" in filtered.columns:
        r = risk.lower()
        if r == "disease":
            filtered = filtered[filtered["heart_disease"].fillna(0) > 0]
        elif r == "no_disease":
            filtered = filtered[filtered["heart_disease"].fillna(0) <= 0]

    return filtered


def risk_band(probability: float) -> str:
    if probability < 0.33:
        return "Low"
    if probability < 0.66:
        return "Medium"
    return "High"


@app.get("/health")
def health_check():
    bundle = load_bundle()
    return {
        "status": "ok",
        "model_loaded": bool(bundle),
        "model_metrics": bundle.get("metrics", {}),
    }


@app.post("/predict", response_model=PredictionResponse)
def predict(payload: SensorPayload):
    bundle = load_bundle()
    model = bundle["model"]
    feature_columns = bundle["feature_columns"]

    payload_dict = payload.model_dump()
    row = {col: float(payload_dict.get(col, 0.0)) for col in feature_columns}
    frame = pd.DataFrame([row], columns=feature_columns)

    try:
        probability = float(model.predict_proba(frame)[0][1])
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {exc}") from exc

    return PredictionResponse(probability=probability, risk_level=risk_band(probability))


@app.get("/dataset/summary")
def dataset_summary(
    sex: str | None = None,
    min_age: float | None = None,
    max_age: float | None = None,
    risk: str | None = None,
):
    df = apply_dataset_filters(load_dataset(), sex=sex, min_age=min_age, max_age=max_age, risk=risk)

    if "heart_disease" not in df.columns:
        raise HTTPException(status_code=500, detail="Dataset does not contain heart_disease column")

    # Coerce key numeric columns while preserving missing values.
    numeric_cols = [
        "age",
        "heart_rate",
        "respiratory_rate",
        "spo2",
        "body_temperature",
        "stress_score",
        "fatigue_score",
        "heart_disease",
    ]
    for col in numeric_cols:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    rows = int(len(df))
    columns = int(df.shape[1])
    prevalence = float((df["heart_disease"].fillna(0) > 0).mean() * 100)

    age_series = df["age"].dropna() if "age" in df.columns else pd.Series([], dtype=float)
    if len(age_series) > 0:
        age_bins = pd.cut(age_series, bins=[0, 30, 40, 50, 60, 70, 120], right=False)
        age_dist = age_bins.value_counts().sort_index()
        age_labels = [f"{int(interval.left)}-{int(interval.right - 1)}" for interval in age_dist.index]
        age_counts = [int(v) for v in age_dist.values]
    else:
        age_labels = []
        age_counts = []

    sex_labels = []
    sex_counts = []
    if "sex" in df.columns:
        sex_series = pd.to_numeric(df["sex"], errors="coerce")
        mapped = sex_series.map({1: "Male", 0: "Female"}).fillna("Other")
        sex_dist = mapped.value_counts()
        sex_labels = [str(v) for v in sex_dist.index]
        sex_counts = [int(v) for v in sex_dist.values]

    risk_labels = ["No Disease", "Disease"]
    risk_counts = [
        int((df["heart_disease"].fillna(0) <= 0).sum()),
        int((df["heart_disease"].fillna(0) > 0).sum()),
    ]

    spo2_labels = []
    spo2_counts = []
    if "spo2" in df.columns:
        spo2 = df["spo2"].dropna()
        normal = int((spo2 >= 95).sum())
        caution = int(((spo2 >= 92) & (spo2 < 95)).sum())
        low = int((spo2 < 92).sum())
        spo2_labels = ["Normal (>=95)", "Caution (92-94)", "Low (<92)"]
        spo2_counts = [normal, caution, low]

    selected_means = {}
    for col in ["age", "heart_rate", "spo2", "respiratory_rate", "body_temperature", "stress_score"]:
        if col in df.columns:
            selected_means[col] = float(df[col].dropna().mean()) if df[col].dropna().size else 0.0

    return {
        "rows": rows,
        "columns": columns,
        "disease_prevalence_pct": prevalence,
        "selected_feature_means": selected_means,
        "age_distribution": {"labels": age_labels, "counts": age_counts},
        "sex_distribution": {"labels": sex_labels, "counts": sex_counts},
        "risk_distribution": {"labels": risk_labels, "counts": risk_counts},
        "spo2_band_distribution": {"labels": spo2_labels, "counts": spo2_counts},
    }


@app.get("/dataset/sample")
def dataset_sample(
    limit: int = 100,
    sex: str | None = None,
    min_age: float | None = None,
    max_age: float | None = None,
    risk: str | None = None,
):
    df = apply_dataset_filters(load_dataset(), sex=sex, min_age=min_age, max_age=max_age, risk=risk)
    safe_limit = max(1, min(int(limit), 250))

    sample = df.head(safe_limit).where(pd.notna(df.head(safe_limit)), None)
    columns = [str(c) for c in sample.columns]
    rows = sample.to_dict(orient="records")

    return {
        "columns": columns,
        "rows": rows,
        "returned": len(rows),
    }


if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
