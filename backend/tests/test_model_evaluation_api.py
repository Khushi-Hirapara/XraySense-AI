"""Authorization and error handling for GET /model-evaluation/report."""

import json

import numpy as np
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.deps import get_current_user
from app.models.user import User
from app.routes.model_evaluation import router
from app.services import model_evaluation as evaluation_service
from model.evaluation_report import assemble_report


def _user(role: str) -> User:
    return User(id=1, email=f"{role}@example.com", name=role, hashed_password="x", role=role)


def _sample_report() -> dict:
    probs = np.array([[0.8, 0.2, 0.0], [0.3, 0.7, 0.0], [0.6, 0.4, 0.0], [0.1, 0.9, 0.0]])
    labels = np.array([0, 1, 0, 1])
    report = assemble_report(
        val_probs=probs,
        val_labels=labels,
        test_probs=probs,
        test_labels=labels,
        class_names=("NORMAL", "PNEUMONIA", "COVID"),
        class_indices={"NORMAL": 0, "PNEUMONIA": 1, "COVID": 2},
        model_info={
            "file_name": "m.h5",
            "sha256": "not-the-deployed-model",
            "size_bytes": 1,
            "version_label": "test",
            "architecture": "test",
        },
        preprocessing_info={"description": "test", "image_size": 224},
    )
    return json.loads(json.dumps(report))  # same round-trip as the JSON file


@pytest.fixture
def client_for(tmp_path, monkeypatch):
    report_path = tmp_path / "evaluation_report.json"
    monkeypatch.setattr(evaluation_service, "DEFAULT_REPORT_PATH", report_path)

    def _make(role: str | None) -> tuple[TestClient, object]:
        app = FastAPI()
        app.include_router(router)
        if role is not None:
            app.dependency_overrides[get_current_user] = lambda: _user(role)
        return TestClient(app), report_path

    return _make


def test_missing_authorization_header_is_rejected(client_for):
    client, report_path = client_for(None)
    report_path.write_text(json.dumps(_sample_report()), encoding="utf-8")
    response = client.get("/model-evaluation/report")
    # The shared get_current_user dependency declares the header as required -> 422.
    assert response.status_code == 422
    assert "report" not in response.json()


def test_invalid_token_is_rejected(client_for):
    client, report_path = client_for(None)
    report_path.write_text(json.dumps(_sample_report()), encoding="utf-8")
    response = client.get(
        "/model-evaluation/report", headers={"Authorization": "Bearer not-a-real-token"}
    )
    assert response.status_code == 401


def test_patient_is_forbidden(client_for):
    client, report_path = client_for("patient")
    report_path.write_text(json.dumps(_sample_report()), encoding="utf-8")
    response = client.get("/model-evaluation/report")
    assert response.status_code == 403


def test_doctor_receives_report(client_for):
    client, report_path = client_for("doctor")
    report_path.write_text(json.dumps(_sample_report()), encoding="utf-8")
    response = client.get("/model-evaluation/report")
    assert response.status_code == 200
    body = response.json()
    assert body["report"]["positive_class"] == "PNEUMONIA"
    assert body["report"]["label_mapping"] == {"NORMAL": 0, "PNEUMONIA": 1, "COVID": 2}
    assert body["report"]["operating_points"][0]["id"] == "argmax"
    # The sample report was built from a different model hash than the deployed file.
    assert body["model_matches_report"] in (False, None)


def test_report_contains_no_file_paths(client_for):
    client, report_path = client_for("doctor")
    report_path.write_text(json.dumps(_sample_report()), encoding="utf-8")
    text = client.get("/model-evaluation/report").text.lower()
    for marker in (".jpeg", ".jpg", ".png", "dataset/test/", "dataset\\\\test"):
        assert marker not in text


def test_missing_report_returns_404(client_for):
    client, _ = client_for("doctor")
    response = client.get("/model-evaluation/report")
    assert response.status_code == 404
    assert "build_evaluation_report.py" in response.json()["detail"]


def test_malformed_report_returns_500(client_for):
    client, report_path = client_for("doctor")
    report_path.write_text('{"schema_version": 1}', encoding="utf-8")
    response = client.get("/model-evaluation/report")
    assert response.status_code == 500


def _serve_with_model(client_for, monkeypatch, model_path, report_sha):
    from types import SimpleNamespace

    import app.routes.model_evaluation as route_module

    monkeypatch.setattr(
        route_module,
        "settings",
        SimpleNamespace(resolved_model_path=model_path, model_version="deployed-test"),
    )
    client, report_path = client_for("doctor")
    report = _sample_report()
    report["model"]["sha256"] = report_sha
    report_path.write_text(json.dumps(report), encoding="utf-8")
    return client.get("/model-evaluation/report").json()


def test_stale_report_detection(client_for, monkeypatch, tmp_path):
    import hashlib

    model_path = tmp_path / "model.h5"
    model_path.write_bytes(b"weights-v1")
    evaluated_sha = hashlib.sha256(b"weights-v1").hexdigest()

    body = _serve_with_model(client_for, monkeypatch, model_path, evaluated_sha)
    assert body["model_matches_report"] is True
    assert body["deployed_model_version"] == "deployed-test"

    # Deployed artifact replaced after the report was built -> flagged as stale.
    model_path.write_bytes(b"weights-v2-retrained")
    body = _serve_with_model(client_for, monkeypatch, model_path, evaluated_sha)
    assert body["model_matches_report"] is False

    # Deployed artifact missing -> cannot compare.
    model_path.unlink()
    body = _serve_with_model(client_for, monkeypatch, model_path, evaluated_sha)
    assert body["model_matches_report"] is None


def test_report_exposes_three_class_primary_and_separate_binary_section(client_for):
    client, report_path = client_for("doctor")
    report_path.write_text(json.dumps(_sample_report()), encoding="utf-8")
    report = client.get("/model-evaluation/report").json()["report"]
    assert report["production_decision"]["rule"] == "argmax"
    assert report["production_decision"]["probability_threshold"] is None
    matrix = report["multiclass"]["confusion_matrix"]
    assert len(matrix) == 3 and all(len(row) == 3 for row in matrix)
    assert [c["label"] for c in report["multiclass"]["classification_report"]["classes"]] == [
        "NORMAL",
        "PNEUMONIA",
        "COVID",
    ]
    assert "macro" in report["multiclass"]["roc_auc_ovr"]
    assert report["binary_task"]["excluded_classes"] == ["COVID"]


def test_outdated_v1_report_is_rejected(client_for):
    client, report_path = client_for("doctor")
    old = _sample_report()
    old["schema_version"] = 1
    report_path.write_text(json.dumps(old), encoding="utf-8")
    response = client.get("/model-evaluation/report")
    assert response.status_code == 500
    assert "Regenerate" in response.json()["detail"]
