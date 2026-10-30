"""Dataset EDA: scanning, quality checks, report contents, and the doctor-only API."""

import io
import json
import shutil
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image

from app.core.deps import get_current_user
from app.models.user import User
from app.routes.dataset_eda import router
from app.services import dataset_eda as eda_service
from model.dataset_eda import (
    inspect_dataset,
    scan_structure,
    select_samples,
    summarize,
    write_thumbnail,
)

CLASS_NAMES = ("NORMAL", "PNEUMONIA", "COVID")
BACKEND_ROOT = Path(__file__).resolve().parent.parent


def _image(path: Path, size=(300, 240), color=128, fmt="PNG") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("L", size, color).save(path, format=fmt)


@pytest.fixture
def dataset(tmp_path: Path) -> Path:
    """
    train/NORMAL: 3 PNG (one 100x100, below the 224 minimum) + notes.txt
    train/PNEUMONIA: 2 JPEG + 1 corrupted + 1 truncated
    train/COVID: empty folder
    test/NORMAL: 1 PNG that duplicates a train/NORMAL file
    test/PNEUMONIA: 1 JPEG that byte-duplicates a train/NORMAL file (conflicting label)
    test/COVID: missing
    val/: missing entirely
    """
    root = tmp_path / "dataset"
    _image(root / "train/NORMAL/a.png", color=10)
    _image(root / "train/NORMAL/b.png", color=20)
    _image(root / "train/NORMAL/small.png", size=(100, 100), color=30)
    (root / "train/NORMAL/notes.txt").write_text("not an image")
    _image(root / "train/PNEUMONIA/p1.jpeg", size=(400, 200), color=40, fmt="JPEG")
    _image(root / "train/PNEUMONIA/p2.jpeg", size=(400, 200), color=50, fmt="JPEG")
    (root / "train/PNEUMONIA/corrupt.jpeg").write_bytes(b"definitely not a jpeg")
    buf = io.BytesIO()
    Image.effect_noise((256, 256), 64).save(buf, format="JPEG")
    (root / "train/PNEUMONIA/truncated.jpeg").write_bytes(buf.getvalue()[: len(buf.getvalue()) // 2])
    (root / "train/COVID").mkdir(parents=True)
    (root / "test/NORMAL").mkdir(parents=True)
    shutil.copy(root / "train/NORMAL/a.png", root / "test/NORMAL/a_copy.png")
    (root / "test/PNEUMONIA").mkdir(parents=True)
    shutil.copy(root / "train/NORMAL/b.png", root / "test/PNEUMONIA/b_mislabeled.png")
    return root


def _build(root: Path, samples_dir: Path | None = None) -> dict:
    folders = scan_structure(root, CLASS_NAMES)
    records = inspect_dataset(folders, workers=2)
    samples = []
    if samples_dir is not None:
        samples = [write_thumbnail(r, samples_dir) for r in select_samples(records, CLASS_NAMES, per_class=2)]
    report = summarize(folders, records, CLASS_NAMES, samples=samples)
    report["label_mapping"] = {"NORMAL": 0, "PNEUMONIA": 1, "COVID": 2}
    return json.loads(json.dumps(report))


# --------------------------------------------------------------------------- #
# Scanning and statistics                                                     #
# --------------------------------------------------------------------------- #


def test_class_and_split_counts(dataset):
    report = _build(dataset)
    splits = {s["split"]: s for s in report["splits"]}
    assert [s["split"] for s in report["splits"]] == ["train", "val", "test"]
    assert splits["train"]["class_counts"] == {"NORMAL": 3, "PNEUMONIA": 4, "COVID": 0}
    assert splits["train"]["total"] == 7
    assert splits["train"]["non_image_files"] == 1  # notes.txt is not counted as an image
    assert splits["test"]["class_counts"] == {"NORMAL": 1, "PNEUMONIA": 1, "COVID": 0}
    assert splits["val"]["exists"] is False and splits["val"]["total"] == 0
    assert report["overall"]["class_counts"] == {"NORMAL": 4, "PNEUMONIA": 5, "COVID": 0}
    assert report["overall"]["total"] == 9
    assert report["overall"]["class_percentages"]["NORMAL"] == pytest.approx(4 / 9)
    assert report["overall"]["class_percentages"]["COVID"] == 0.0


def test_missing_and_empty_folders(dataset):
    quality = _build(dataset)["quality"]
    assert "test/COVID" in quality["missing_folders"]
    assert {"val/NORMAL", "val/PNEUMONIA", "val/COVID"} <= set(quality["missing_folders"])
    assert quality["empty_folders"] == ["train/COVID"]
    texts = " ".join(f["text"] for f in _build(dataset)["findings"])
    assert "Missing class folder: test/COVID" in texts
    assert "Class folder has no images: train/COVID" in texts


def test_corrupted_and_truncated_images_are_unreadable(dataset):
    report = _build(dataset)
    unreadable = report["quality"]["unreadable"]
    assert unreadable["count"] == 2
    assert unreadable["by_folder"] == {"train/PNEUMONIA": 2}
    # Unreadable files are counted in the split totals but excluded from dimensions.
    assert report["image_properties"]["measured_images"] == 7


def test_labels_and_dimensions_follow_folders(dataset):
    folders = scan_structure(dataset, CLASS_NAMES)
    records = {r.path.name: r for r in inspect_dataset(folders, workers=1)}
    assert records["p1.jpeg"].label == "PNEUMONIA" and records["p1.jpeg"].split == "train"
    assert (records["p1.jpeg"].width, records["p1.jpeg"].height) == (400, 200)
    assert records["b_mislabeled.png"].label == "PNEUMONIA"
    props = _build(dataset)["image_properties"]
    assert props["formats_by_class"]["PNEUMONIA"] == {"JPEG": 2, "PNG": 1}
    assert props["width"]["PNEUMONIA"]["max"] == 400
    assert props["width"]["COVID"] is None  # no images: undefined, not zero


def test_duplicates_and_dimension_issues(dataset):
    quality = _build(dataset)["quality"]
    dup = quality["duplicates"]
    assert dup["duplicate_groups"] == 2
    assert dup["redundant_copies"] == 2
    assert dup["groups_spanning_splits"] == {"test-train": 2}
    assert dup["groups_with_conflicting_labels"] == 1  # b.png is NORMAL in train, PNEUMONIA in test
    dims = quality["dimension_issues"]
    # small.png (100x100) and both 400x200 JPEGs have a side below 224.
    assert dims["below_min_dimension"] == 3
    assert dims["extreme_aspect_ratio"] == 2  # the 400x200 JPEGs (2:1)


def test_class_weights_match_training_formula(dataset):
    # COVID is empty in train, so balanced weights are undefined.
    assert _build(dataset)["class_weights"] is None
    _image(dataset / "train/COVID/c.png", color=99)
    weights = _build(dataset)["class_weights"]
    total = 3 + 4 + 1
    assert weights == pytest.approx({"NORMAL": total / 9, "PNEUMONIA": total / 12, "COVID": total / 3})


def test_report_contains_no_file_names_or_paths(dataset, tmp_path):
    text = json.dumps(_build(dataset, samples_dir=tmp_path / "samples"))
    for marker in ("a.png", "p1.jpeg", "notes.txt", "corrupt", "mislabeled", str(tmp_path), "\\\\", "/train/"):
        assert marker not in text


def test_samples_are_clean_thumbnails_with_opaque_ids(dataset, tmp_path):
    out = tmp_path / "samples"
    report = _build(dataset, samples_dir=out)
    assert {s["label"] for s in report["samples"]} == {"NORMAL", "PNEUMONIA"}
    for sample in report["samples"]:
        path = out / f"{sample['id']}.png"
        with Image.open(path) as img:
            assert max(img.size) <= 256
            assert not img.info  # no EXIF / text chunks carried over
    # Deterministic selection.
    again = _build(dataset, samples_dir=tmp_path / "samples2")
    assert [s["id"] for s in again["samples"]] == [s["id"] for s in report["samples"]]


def test_augmentation_summary_matches_training_source():
    """Guard the hand-written augmentation summary against drift in train_model.py."""
    source = (BACKEND_ROOT / "model" / "train_model.py").read_text(encoding="utf-8")
    for snippet in (
        "tf.image.random_flip_left_right(images)",
        "tf.image.random_brightness(images, max_delta=20.0)",
        "tf.image.random_contrast(images, lower=0.9, upper=1.1)",
        '"validation_split": 0.2',
    ):
        assert snippet in source
    build_src = (BACKEND_ROOT / "model" / "build_dataset_eda.py").read_text(encoding="utf-8")
    assert "max_delta=20.0" in build_src and "lower=0.9, upper=1.1" in build_src


# --------------------------------------------------------------------------- #
# API                                                                         #
# --------------------------------------------------------------------------- #


def _user(role: str) -> User:
    return User(id=1, email=f"{role}@example.com", name=role, hashed_password="x", role=role)


@pytest.fixture
def api(dataset, tmp_path, monkeypatch):
    report_path = tmp_path / "dataset_eda_report.json"
    samples_dir = tmp_path / "eda_samples"
    report = _build(dataset, samples_dir=samples_dir)
    report_path.write_text(json.dumps(report), encoding="utf-8")
    monkeypatch.setattr(eda_service, "DEFAULT_REPORT_PATH", report_path)
    monkeypatch.setattr(eda_service, "DEFAULT_SAMPLES_DIR", samples_dir)
    monkeypatch.setattr(eda_service, "DEFAULT_DATASET_DIR", dataset)
    eda_service._count_cache.clear()

    def client(role: str | None) -> TestClient:
        app = FastAPI()
        app.include_router(router)
        if role is not None:
            app.dependency_overrides[get_current_user] = lambda: _user(role)
        return TestClient(app)

    return {"client": client, "report": report, "report_path": report_path, "samples_dir": samples_dir}


def test_unauthenticated_requests_are_rejected(api):
    sample_id = api["report"]["samples"][0]["id"]
    anon = api["client"](None)
    assert anon.get("/dataset-eda/report").status_code == 422  # header required (shared dependency)
    assert anon.get(f"/dataset-eda/samples/{sample_id}").status_code == 422
    bad = {"Authorization": "Bearer not-a-token"}
    assert anon.get("/dataset-eda/report", headers=bad).status_code == 401
    assert anon.get(f"/dataset-eda/samples/{sample_id}", headers=bad).status_code == 401


def test_patients_are_forbidden(api):
    patient = api["client"]("patient")
    sample_id = api["report"]["samples"][0]["id"]
    assert patient.get("/dataset-eda/report").status_code == 403
    assert patient.get(f"/dataset-eda/samples/{sample_id}").status_code == 403


def test_doctor_gets_report_and_samples(api):
    doctor = api["client"]("doctor")
    response = doctor.get("/dataset-eda/report")
    assert response.status_code == 200
    body = response.json()
    assert body["dataset_available"] is True
    assert body["dataset_matches_report"] is True
    assert body["report"]["class_names"] == list(CLASS_NAMES)
    sample = doctor.get(f"/dataset-eda/samples/{body['report']['samples'][0]['id']}")
    assert sample.status_code == 200
    assert sample.headers["content-type"] == "image/png"


def test_dataset_change_is_detected(api, dataset):
    _image(dataset / "train/COVID/new.png", color=77)
    eda_service._count_cache.clear()
    body = api["client"]("doctor").get("/dataset-eda/report").json()
    assert body["dataset_matches_report"] is False


def test_unavailable_dataset_still_serves_report(api, monkeypatch, tmp_path):
    monkeypatch.setattr(eda_service, "DEFAULT_DATASET_DIR", tmp_path / "does-not-exist")
    response = api["client"]("doctor").get("/dataset-eda/report")
    assert response.status_code == 200
    assert response.json()["dataset_available"] is False
    assert response.json()["dataset_matches_report"] is None


def test_missing_and_malformed_report(api):
    doctor = api["client"]("doctor")
    api["report_path"].write_text('{"schema_version": 1}', encoding="utf-8")
    assert doctor.get("/dataset-eda/report").status_code == 500
    api["report_path"].unlink()
    response = doctor.get("/dataset-eda/report")
    assert response.status_code == 404
    assert "build_dataset_eda.py" in response.json()["detail"]


def test_sample_access_is_restricted_to_listed_ids(api):
    doctor = api["client"]("doctor")
    # A real PNG in the samples directory that the report does not list.
    unlisted = "f" * 16
    _image(api["samples_dir"] / f"{unlisted}.png")
    assert doctor.get(f"/dataset-eda/samples/{unlisted}").status_code == 404
    assert doctor.get("/dataset-eda/samples/zzzzzzzzzzzzzzzz").status_code == 404
    for attempt in ("..%2F..%2F..%2F.env", "..%5C..%5C.env.txt", "%2e%2e%2f%2e%2e%2f"):
        response = doctor.get(f"/dataset-eda/samples/{attempt}")
        assert response.status_code in (404, 422)
        assert response.headers.get("content-type", "").startswith("application/json")
