import json
import sqlite3
from datetime import datetime, timezone
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
HARDWARE_DATABASE_PATH = BASE_DIR / "health_readings.sqlite3"
MODEL_EVALUATION_PATH = BASE_DIR / "model_evaluation.json"
MODEL_COMPARISON_PATH = BASE_DIR / "model_comparison.json"
RISK_SCORE_MIN = 0.0
RISK_SCORE_MAX = 40.0


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
    risk_score: float
    risk_level: Literal["Low", "Medium", "High"]


class HealthData(BaseModel):
    temperature: float
    heartRate: int
    spo2: int
    accX: int
    accY: int
    accZ: int
    gyroX: int
    gyroY: int
    gyroZ: int


class HealthRecord(HealthData):
    id: int
    received_at: str


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


def get_hardware_database_connection():
    connection = sqlite3.connect(HARDWARE_DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def initialize_hardware_database() -> None:
    with get_hardware_database_connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS health_readings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                received_at TEXT NOT NULL,
                temperature REAL NOT NULL,
                heart_rate INTEGER NOT NULL,
                spo2 INTEGER NOT NULL,
                acc_x INTEGER NOT NULL,
                acc_y INTEGER NOT NULL,
                acc_z INTEGER NOT NULL,
                gyro_x INTEGER NOT NULL,
                gyro_y INTEGER NOT NULL,
                gyro_z INTEGER NOT NULL
            )
            """
        )


def serialize_health_row(row: sqlite3.Row | None) -> dict | None:
    if row is None:
        return None

    return {
        "id": int(row["id"]),
        "received_at": str(row["received_at"]),
        "temperature": float(row["temperature"]),
        "heartRate": int(row["heart_rate"]),
        "spo2": int(row["spo2"]),
        "accX": int(row["acc_x"]),
        "accY": int(row["acc_y"]),
        "accZ": int(row["acc_z"]),
        "gyroX": int(row["gyro_x"]),
        "gyroY": int(row["gyro_y"]),
        "gyroZ": int(row["gyro_z"]),
    }


def insert_health_row(data: HealthData) -> dict:
    timestamp = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")

    with get_hardware_database_connection() as connection:
        cursor = connection.execute(
            """
            INSERT INTO health_readings (
                received_at,
                temperature,
                heart_rate,
                spo2,
                acc_x,
                acc_y,
                acc_z,
                gyro_x,
                gyro_y,
                gyro_z
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                timestamp,
                float(data.temperature),
                int(data.heartRate),
                int(data.spo2),
                int(data.accX),
                int(data.accY),
                int(data.accZ),
                int(data.gyroX),
                int(data.gyroY),
                int(data.gyroZ),
            ),
        )

        row = connection.execute(
            "SELECT * FROM health_readings WHERE id = ?",
            (cursor.lastrowid,),
        ).fetchone()

    serialized = serialize_health_row(row)
    if serialized is None:
        raise RuntimeError("Failed to persist hardware reading")
    return serialized


def fetch_latest_health_row() -> dict | None:
    with get_hardware_database_connection() as connection:
        row = connection.execute(
            "SELECT * FROM health_readings ORDER BY id DESC LIMIT 1"
        ).fetchone()

    return serialize_health_row(row)


def fetch_health_history(limit: int = 25) -> list[dict]:
    safe_limit = max(1, min(int(limit), 250))

    with get_hardware_database_connection() as connection:
        rows = connection.execute(
            "SELECT * FROM health_readings ORDER BY id DESC LIMIT ?",
            (safe_limit,),
        ).fetchall()

    return [serialized for serialized in (serialize_health_row(row) for row in reversed(rows)) if serialized is not None]


def count_health_rows() -> int:
    with get_hardware_database_connection() as connection:
        row = connection.execute("SELECT COUNT(*) AS total FROM health_readings").fetchone()

    return int(row["total"] if row is not None else 0)


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


def risk_band(risk_score: float) -> str:
    low_threshold = RISK_SCORE_MAX / 3.0
    medium_threshold = (2.0 * RISK_SCORE_MAX) / 3.0

    if risk_score < low_threshold:
        return "Low"
    if risk_score < medium_threshold:
        return "Medium"
    return "High"


def display_risk_score(original_risk: float) -> float:
    normalized = max(0.0, min(100.0, float(original_risk)))
    scaled = (normalized / 100.0) * RISK_SCORE_MAX
    return round(max(RISK_SCORE_MIN, min(RISK_SCORE_MAX, scaled)), 1)


def read_json_file(path: Path) -> dict:
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8") as fp:
        data = json.load(fp)
    return data if isinstance(data, dict) else {}


@app.on_event("startup")
def on_startup() -> None:
    initialize_hardware_database()


@app.get("/health")
def health_check():
    bundle = load_bundle()
    return {
        "status": "ok",
        "model_loaded": bool(bundle),
        "model_metrics": bundle.get("metrics", {}),
        "hardware_readings": count_health_rows(),
    }


@app.get("/model/insights")
def model_insights():
    bundle = load_bundle()
    metrics = bundle.get("metrics", {})

    evaluation = read_json_file(MODEL_EVALUATION_PATH)
    comparison = read_json_file(MODEL_COMPARISON_PATH)

    models = comparison.get("models", []) if isinstance(comparison, dict) else []
    selected_vs_other = comparison.get("selected_model_vs_best_other", {}) if isinstance(comparison, dict) else {}

    return {
        "model_name": bundle.get("model_name", "AdaBoost Classifier"),
        "metrics": {
            "train_accuracy": float(metrics.get("train_accuracy", 0.0)),
            "test_accuracy": float(metrics.get("test_accuracy", 0.0)),
            "roc_auc": float(metrics.get("roc_auc", 0.0)) if metrics.get("roc_auc") is not None else 0.0,
            "rows": int(metrics.get("rows", 0)),
        },
        "top_features": evaluation.get("top_features", []) if isinstance(evaluation, dict) else [],
        "confusion_matrix": evaluation.get("confusion_matrix", []) if isinstance(evaluation, dict) else [],
        "comparison": {
            "models": models,
            "selected_model_vs_best_other": {
                "accuracy_gain_pct": float(selected_vs_other.get("accuracy_gain_pct", 0.0)),
                "balanced_accuracy_gain_pct": float(selected_vs_other.get("balanced_accuracy_gain_pct", 0.0)),
                "roc_auc_gain_pct": float(selected_vs_other.get("roc_auc_gain_pct", 0.0)),
            },
        },
        "backend_flow": [
            "Receive ESP8266 readings from /api/health",
            "Store each reading in SQLite so the dashboard can replay the latest device state",
            "Merge the latest hardware sample with patient demographics and model proxies",
            "Build the feature frame using the trained feature order",
            "Run AdaBoost probability prediction",
            "Scale the score to a calibrated 0-40 range and map it to Low / Medium / High",
            "Return JSON response to frontend",
        ],
    }


@app.post("/api/health")
def receive_hardware_health(data: HealthData):
    record = insert_health_row(data)
    return {
        "status": "success",
        "message": "Hardware data received and stored",
        "record": record,
    }


@app.get("/api/health/latest")
def get_latest_hardware_health():
    record = fetch_latest_health_row()
    if record is None:
        raise HTTPException(status_code=404, detail="No hardware readings available yet")

    return {
        "status": "success",
        "record": record,
    }


@app.get("/api/health/history")
def get_hardware_health_history(limit: int = 25):
    return {
        "status": "success",
        "records": fetch_health_history(limit=limit),
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

    risk_score = display_risk_score(probability * 100.0)
    return PredictionResponse(risk_score=risk_score, risk_level=risk_band(risk_score))


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

    age_risk_labels = []
    age_risk_rates = []
    if "age" in df.columns:
        age_risk_frame = df[["age", "heart_disease"]].dropna(subset=["age"]).copy()
        if not age_risk_frame.empty:
            age_risk_frame["age_band"] = pd.cut(
                age_risk_frame["age"],
                bins=[0, 30, 40, 50, 60, 70, 120],
                right=False,
            )
            age_risk = (
                age_risk_frame.groupby("age_band", observed=False)["heart_disease"]
                .apply(lambda s: float((s.fillna(0) > 0).mean() * 100))
                .fillna(0.0)
            )
            age_risk_labels = [f"{int(interval.left)}-{int(interval.right - 1)}" for interval in age_risk.index]
            age_risk_rates = [round(float(v), 1) for v in age_risk.values]

    sex_risk_labels = []
    sex_risk_rates = []
    if "sex" in df.columns:
        sex_risk_frame = df[["sex", "heart_disease"]].copy()
        sex_risk_frame["sex"] = pd.to_numeric(sex_risk_frame["sex"], errors="coerce")
        sex_risk_frame["sex_label"] = sex_risk_frame["sex"].map({1: "Male", 0: "Female"}).fillna("Other")
        sex_risk = (
            sex_risk_frame.groupby("sex_label")["heart_disease"]
            .apply(lambda s: float((pd.to_numeric(s, errors="coerce").fillna(0) > 0).mean() * 100))
            .fillna(0.0)
            .sort_index()
        )
        sex_risk_labels = [str(v) for v in sex_risk.index]
        sex_risk_rates = [round(float(v), 1) for v in sex_risk.values]

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
        "age_risk_distribution": {"labels": age_risk_labels, "rates": age_risk_rates},
        "sex_risk_distribution": {"labels": sex_risk_labels, "rates": sex_risk_rates},
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
