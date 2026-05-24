import json
from pathlib import Path

import joblib
import pandas as pd
from sklearn.base import clone
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import AdaBoostClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.impute import SimpleImputer
from sklearn.metrics import (
    balanced_accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.naive_bayes import GaussianNB
from sklearn.tree import DecisionTreeClassifier


DATASET_NAME = "merged_cardiac_training_dataset.csv"
MODEL_PATH = Path(__file__).resolve().parent / "model.pkl"
EVALUATION_PATH = Path(__file__).resolve().parent / "model_evaluation.json"
FEATURE_IMPORTANCE_PATH = Path(__file__).resolve().parent / "feature_importance.csv"
MODEL_COMPARISON_PATH = Path(__file__).resolve().parent / "model_comparison.json"
TARGET_COLUMN = "heart_disease"

FEATURE_COLUMNS = [
    "age",
    "sex",
    "heart_rate",
    "respiratory_rate",
    "spo2",
    "pulse_rate",
    "body_temperature",
    "hrv_rmssd",
    "hrv_sdnn",
    "activity_level",
    "camera_heart_rate",
    "camera_hrv",
    "respiration_rate_camera",
    "stress_score",
    "fatigue_score",
    "estimated_age",
    "skin_perfusion_index",
]

DEFAULTS = {
    "age": 50,
    "sex": 1,
    "heart_rate": 78,
    "respiratory_rate": 16,
    "spo2": 97,
    "pulse_rate": 78,
    "body_temperature": 36.9,
    "hrv_rmssd": 32,
    "hrv_sdnn": 45,
    "activity_level": 45,
    "camera_heart_rate": 77,
    "camera_hrv": 34,
    "respiration_rate_camera": 16,
    "stress_score": 45,
    "fatigue_score": 40,
    "estimated_age": 50,
    "skin_perfusion_index": 1.2,
}


def resolve_dataset_path() -> Path:
    candidates = [
        Path(__file__).resolve().parent / DATASET_NAME,
        Path(__file__).resolve().parents[1] / DATASET_NAME,
        Path(__file__).resolve().parents[2] / DATASET_NAME,
    ]

    for path in candidates:
        if path.exists():
            return path

    raise FileNotFoundError(
        f"Dataset not found. Expected one of: {', '.join(str(p) for p in candidates)}"
    )


def load_training_data(path: Path) -> pd.DataFrame:
    if not path.exists():
        raise FileNotFoundError(f"Dataset not found at {path}")

    df = pd.read_csv(path)
    df.columns = [c.strip().lower() for c in df.columns]

    if TARGET_COLUMN not in df.columns:
        raise ValueError(
            f"Target column '{TARGET_COLUMN}' not found. Available columns: {list(df.columns)}"
        )

    for feature in FEATURE_COLUMNS:
        if feature not in df.columns:
            df[feature] = DEFAULTS[feature]

    # Ensure numeric dtypes for model pipeline.
    for feature in FEATURE_COLUMNS:
        df[feature] = pd.to_numeric(df[feature], errors="coerce")

    df[TARGET_COLUMN] = pd.to_numeric(df[TARGET_COLUMN], errors="coerce").fillna(0).astype(int)
    return df


def train_and_save(df: pd.DataFrame, model_path: Path) -> None:
    x = df[FEATURE_COLUMNS]
    y = df[TARGET_COLUMN]
    selected_model_name = "AdaBoost Classifier"

    x_train, x_test, y_train, y_test = train_test_split(
        x, y, test_size=0.2, random_state=42, stratify=y if y.nunique() > 1 else None
    )

    model = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="median")),
            (
                "ada",
                AdaBoostClassifier(
                    estimator=DecisionTreeClassifier(
                        max_depth=3,
                        random_state=42,
                        class_weight="balanced",
                    ),
                    random_state=42,
                ),
            ),
        ]
    )

    model.fit(x_train, y_train)
    train_score = model.score(x_train, y_train)
    test_score = model.score(x_test, y_test)

    y_pred = model.predict(x_test)
    y_proba = model.predict_proba(x_test)[:, 1]

    report = classification_report(y_test, y_pred, output_dict=True, zero_division=0)
    conf = confusion_matrix(y_test, y_pred)
    roc_auc = roc_auc_score(y_test, y_proba) if y.nunique() > 1 else None

    ada_model = model.named_steps["ada"]
    feature_importance_df = (
        pd.DataFrame(
            {
                "feature": FEATURE_COLUMNS,
                "importance": ada_model.feature_importances_,
            }
        )
        .sort_values("importance", ascending=False)
        .reset_index(drop=True)
    )

    feature_importance_df.to_csv(FEATURE_IMPORTANCE_PATH, index=False)

    evaluation = {
        "train_accuracy": float(train_score),
        "test_accuracy": float(test_score),
        "roc_auc": float(roc_auc) if roc_auc is not None else None,
        "rows": int(len(df)),
        "confusion_matrix": conf.tolist(),
        "classification_report": report,
        "top_features": feature_importance_df.head(10).to_dict(orient="records"),
    }

    with EVALUATION_PATH.open("w", encoding="utf-8") as fp:
        json.dump(evaluation, fp, indent=2)

    benchmark_models = {
        selected_model_name: model,
        "Random Forest": Pipeline(
            steps=[
                ("imputer", SimpleImputer(strategy="median")),
                (
                    "rf",
                    RandomForestClassifier(
                        n_estimators=300,
                        max_depth=10,
                        random_state=42,
                        class_weight="balanced",
                    ),
                ),
            ]
        ),
        "Naive Bayes": Pipeline(
            steps=[
                ("imputer", SimpleImputer(strategy="median")),
                ("nb", GaussianNB()),
            ]
        ),
        "Logistic Regression": Pipeline(
            steps=[
                ("imputer", SimpleImputer(strategy="median")),
                ("lr", LogisticRegression(max_iter=1000, class_weight="balanced")),
            ]
        ),
        "Decision Tree": Pipeline(
            steps=[
                ("imputer", SimpleImputer(strategy="median")),
                ("dt", DecisionTreeClassifier(max_depth=8, random_state=42, class_weight="balanced")),
            ]
        ),
        "Baseline (Most Frequent)": Pipeline(
            steps=[
                ("imputer", SimpleImputer(strategy="median")),
                ("dummy", DummyClassifier(strategy="most_frequent")),
            ]
        ),
    }

    comparison_rows = []
    for name, estimator in benchmark_models.items():
        fitted = clone(estimator)
        fitted.fit(x_train, y_train)

        pred = fitted.predict(x_test)
        if hasattr(fitted, "predict_proba"):
            proba = fitted.predict_proba(x_test)[:, 1]
        else:
            proba = pred

        accuracy = float(fitted.score(x_test, y_test))
        balanced_accuracy = float(balanced_accuracy_score(y_test, pred))
        f1 = float(f1_score(y_test, pred, zero_division=0))
        auc = float(roc_auc_score(y_test, proba)) if y.nunique() > 1 else None

        comparison_rows.append(
            {
                "model": name,
                "accuracy": accuracy,
                "balanced_accuracy": balanced_accuracy,
                "f1": f1,
                "roc_auc": auc,
            }
        )

    selected_row = next((r for r in comparison_rows if r["model"] == selected_model_name), None)
    if selected_row is None:
        raise ValueError(f"Selected model '{selected_model_name}' was not benchmarked")

    others = [r for r in comparison_rows if r["model"] != selected_model_name]

    best_other_acc = max((r["accuracy"] for r in others), default=0.0)
    best_other_bal_acc = max((r["balanced_accuracy"] for r in others), default=0.0)
    best_other_auc = max((r["roc_auc"] for r in others if r["roc_auc"] is not None), default=0.0)

    acc_gain_pct = ((selected_row["accuracy"] - best_other_acc) / best_other_acc * 100) if best_other_acc else 0.0
    bal_acc_gain_pct = (
        ((selected_row["balanced_accuracy"] - best_other_bal_acc) / best_other_bal_acc * 100)
        if best_other_bal_acc
        else 0.0
    )
    auc_gain_pct = ((selected_row["roc_auc"] - best_other_auc) / best_other_auc * 100) if best_other_auc else 0.0

    model_comparison = {
        "selected_model": selected_model_name,
        "models": comparison_rows,
        "selected_model_vs_best_other": {
            "accuracy_gain_pct": round(float(acc_gain_pct), 2),
            "balanced_accuracy_gain_pct": round(float(bal_acc_gain_pct), 2),
            "roc_auc_gain_pct": round(float(auc_gain_pct), 2),
        },
    }

    with MODEL_COMPARISON_PATH.open("w", encoding="utf-8") as fp:
        json.dump(model_comparison, fp, indent=2)

    bundle = {
        "model": model,
        "model_name": selected_model_name,
        "feature_columns": FEATURE_COLUMNS,
        "target": TARGET_COLUMN,
        "metrics": {
            "train_accuracy": float(train_score),
            "test_accuracy": float(test_score),
            "roc_auc": float(roc_auc) if roc_auc is not None else None,
            "rows": int(len(df)),
        },
    }

    joblib.dump(bundle, model_path)

    print(f"Model saved to: {model_path}")
    print(f"Evaluation report saved to: {EVALUATION_PATH}")
    print(f"Model comparison saved to: {MODEL_COMPARISON_PATH}")
    print(f"Feature importance saved to: {FEATURE_IMPORTANCE_PATH}")
    print(f"Train accuracy: {train_score:.4f}")
    print(f"Test accuracy: {test_score:.4f}")
    if roc_auc is not None:
        print(f"ROC-AUC: {roc_auc:.4f}")
    print(f"Rows used: {len(df)}")


if __name__ == "__main__":
    data = load_training_data(resolve_dataset_path())
    train_and_save(data, MODEL_PATH)
