"""Load the precomputed model evaluation report (built offline, never computed per request)."""

from __future__ import annotations

import hashlib
import json
import logging
from functools import lru_cache
from pathlib import Path

from pydantic import ValidationError

from app.core.config import Settings
from app.schemas.model_evaluation import EvaluationReport, ModelEvaluationResponse

logger = logging.getLogger(__name__)

_BACKEND_ROOT = Path(__file__).resolve().parent.parent.parent
DEFAULT_REPORT_PATH = _BACKEND_ROOT / "model" / "evaluation" / "evaluation_report.json"
BUILD_COMMAND = "cd backend && python model/build_evaluation_report.py"


class EvaluationReportNotFound(Exception):
    """No report has been generated yet."""


class EvaluationReportInvalid(Exception):
    """The report file exists but is unreadable or does not match the schema."""


@lru_cache(maxsize=4)
def _sha256_cached(path: str, mtime_ns: int, size: int) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def deployed_model_sha256(model_path: Path) -> str | None:
    try:
        stat = model_path.stat()
    except OSError:
        return None
    return _sha256_cached(str(model_path), stat.st_mtime_ns, stat.st_size)


def load_evaluation_report(report_path: Path = DEFAULT_REPORT_PATH) -> EvaluationReport:
    if not report_path.is_file():
        raise EvaluationReportNotFound(str(report_path))
    try:
        raw = json.loads(report_path.read_text(encoding="utf-8"))
        return EvaluationReport.model_validate(raw)
    except (OSError, json.JSONDecodeError, ValidationError) as exc:
        logger.error("Invalid evaluation report at %s: %s", report_path, exc)
        raise EvaluationReportInvalid(str(report_path)) from exc


def get_model_evaluation(
    settings: Settings, report_path: Path = DEFAULT_REPORT_PATH
) -> ModelEvaluationResponse:
    report = load_evaluation_report(report_path)
    current_sha = deployed_model_sha256(settings.resolved_model_path)
    return ModelEvaluationResponse(
        report=report,
        model_matches_report=None if current_sha is None else current_sha == report.model.sha256,
        deployed_model_version=settings.model_version,
    )
