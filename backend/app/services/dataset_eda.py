"""Serve the precomputed dataset EDA report and its sample thumbnails.

The dataset itself is only listed (never decoded) to detect drift since the report
was built, and that listing is cached. No request parameter is ever used to build
a filesystem path except a sample id that must appear in the report.
"""

from __future__ import annotations

import json
import logging
import os
import re
import time
from functools import lru_cache
from pathlib import Path

from pydantic import ValidationError

from app.schemas.dataset_eda import DatasetEdaReport, DatasetEdaResponse
from model.dataset_eda import IMAGE_EXTENSIONS

logger = logging.getLogger(__name__)

_BACKEND_ROOT = Path(__file__).resolve().parent.parent.parent
_PROJECT_ROOT = _BACKEND_ROOT.parent
DEFAULT_REPORT_PATH = _BACKEND_ROOT / "model" / "evaluation" / "dataset_eda_report.json"
DEFAULT_SAMPLES_DIR = _BACKEND_ROOT / "model" / "evaluation" / "eda_samples"
DEFAULT_DATASET_DIR = _PROJECT_ROOT / "dataset"
BUILD_COMMAND = "cd backend && python model/build_dataset_eda.py"
COUNT_CACHE_SECONDS = 300
SAMPLE_ID_PATTERN = re.compile(r"^[0-9a-f]{16}$")

_count_cache: dict[tuple[str, tuple[str, ...], tuple[str, ...]], tuple[float, dict[str, int]]] = {}


class DatasetEdaReportNotFound(Exception):
    """No report has been generated yet."""


class DatasetEdaReportInvalid(Exception):
    """The report exists but is unreadable or does not match the schema."""


class SampleNotFound(Exception):
    """Unknown, malformed, or missing sample id."""


@lru_cache(maxsize=2)
def _load_cached(path: str, mtime_ns: int) -> DatasetEdaReport:
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    return DatasetEdaReport.model_validate(raw)


def load_report(report_path: Path = DEFAULT_REPORT_PATH) -> DatasetEdaReport:
    try:
        mtime = report_path.stat().st_mtime_ns
    except OSError as exc:
        raise DatasetEdaReportNotFound(str(report_path)) from exc
    try:
        return _load_cached(str(report_path), mtime)
    except (OSError, json.JSONDecodeError, ValidationError) as exc:
        logger.error("Invalid dataset EDA report at %s: %s", report_path, exc)
        raise DatasetEdaReportInvalid(str(report_path)) from exc


def current_folder_counts(
    dataset_dir: Path, splits: tuple[str, ...], class_names: tuple[str, ...]
) -> dict[str, int] | None:
    """Image-file counts per split/class (listing only), cached; None if the dataset is absent."""
    if not dataset_dir.is_dir():
        return None
    key = (str(dataset_dir), splits, class_names)
    cached = _count_cache.get(key)
    now = time.monotonic()
    if cached and now - cached[0] < COUNT_CACHE_SECONDS:
        return cached[1]
    counts: dict[str, int] = {}
    for split in splits:
        for label in class_names:
            folder = dataset_dir / split / label
            n = 0
            if folder.is_dir():
                with os.scandir(folder) as entries:
                    n = sum(
                        1
                        for e in entries
                        if e.is_file() and os.path.splitext(e.name)[1].lower() in IMAGE_EXTENSIONS
                    )
            counts[f"{split}/{label}"] = n
    _count_cache[key] = (now, counts)
    return counts


def get_dataset_eda(
    report_path: Path = DEFAULT_REPORT_PATH,
    dataset_dir: Path = DEFAULT_DATASET_DIR,
) -> DatasetEdaResponse:
    report = load_report(report_path)
    splits = tuple(s.split for s in report.splits)
    current = current_folder_counts(dataset_dir, splits, tuple(report.class_names))
    expected = {
        f"{s.split}/{label}": s.class_counts.get(label, 0)
        for s in report.splits
        for label in report.class_names
    }
    return DatasetEdaResponse(
        report=report,
        dataset_available=current is not None,
        dataset_matches_report=None if current is None else current == expected,
    )


def resolve_sample_path(
    sample_id: str,
    report_path: Path = DEFAULT_REPORT_PATH,
    samples_dir: Path = DEFAULT_SAMPLES_DIR,
) -> Path:
    """Map a report-listed sample id to its thumbnail inside the samples directory."""
    if not SAMPLE_ID_PATTERN.fullmatch(sample_id):
        raise SampleNotFound(sample_id)
    report = load_report(report_path)
    if sample_id not in {s.id for s in report.samples}:
        raise SampleNotFound(sample_id)
    root = samples_dir.resolve()
    path = (root / f"{sample_id}.png").resolve()
    if path.parent != root or not path.is_file():
        raise SampleNotFound(sample_id)
    return path
