"""Canonical prediction labels and helpers for XRaySense API services."""

from __future__ import annotations

from typing import Literal

from app.schemas.predict import PredictionLabel

MODEL_LABEL_TO_API: dict[str, PredictionLabel] = {
    "NORMAL": "Normal",
    "PNEUMONIA": "Pneumonia",
    "COVID": "COVID",
}

NORMAL_LABEL: PredictionLabel = "Normal"
PNEUMONIA_LABEL: PredictionLabel = "Pneumonia"
COVID_LABEL: PredictionLabel = "COVID"

PredictionKey = Literal["normal", "pneumonia", "covid"]


def prediction_key(prediction: str) -> str:
    return prediction.strip().lower()


def is_abnormal_prediction(prediction: str) -> bool:
    key = prediction_key(prediction)
    return key in {"pneumonia", "covid", "covid-19"}


def to_api_label(model_label: str) -> PredictionLabel | None:
    return MODEL_LABEL_TO_API.get(model_label.strip().upper())
