from fastapi import APIRouter, Depends, HTTPException, Path, status
from fastapi.responses import FileResponse

from app.core.deps import require_doctor
from app.models.user import User
from app.schemas.dataset_eda import DatasetEdaResponse
from app.services import dataset_eda as eda_service

router = APIRouter(prefix="/dataset-eda", tags=["dataset-eda"])

_NOT_GENERATED = (
    "No dataset EDA report has been generated yet. "
    f"Run: {eda_service.BUILD_COMMAND}"
)
_INVALID = (
    "The dataset EDA report is unreadable or outdated. "
    f"Regenerate it with: {eda_service.BUILD_COMMAND}"
)


@router.get("/report", response_model=DatasetEdaResponse)
def dataset_eda_report(
    current_user: User = Depends(require_doctor),
) -> DatasetEdaResponse:
    """Aggregate statistics for the training dataset (doctors only, no file names)."""
    try:
        return eda_service.get_dataset_eda(
            eda_service.DEFAULT_REPORT_PATH, eda_service.DEFAULT_DATASET_DIR
        )
    except eda_service.DatasetEdaReportNotFound:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_GENERATED) from None
    except eda_service.DatasetEdaReportInvalid:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=_INVALID
        ) from None


@router.get("/samples/{sample_id}", response_class=FileResponse)
def dataset_eda_sample(
    sample_id: str = Path(..., min_length=16, max_length=16),
    current_user: User = Depends(require_doctor),
) -> FileResponse:
    """Downscaled sample thumbnail listed in the report (opaque id, no path access)."""
    try:
        path = eda_service.resolve_sample_path(
            sample_id, eda_service.DEFAULT_REPORT_PATH, eda_service.DEFAULT_SAMPLES_DIR
        )
    except (eda_service.SampleNotFound, eda_service.DatasetEdaReportNotFound):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sample not found.") from None
    except eda_service.DatasetEdaReportInvalid:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=_INVALID
        ) from None
    return FileResponse(
        path,
        media_type="image/png",
        headers={"Cache-Control": "private, max-age=3600"},
    )
