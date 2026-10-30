from fastapi import APIRouter, Depends, HTTPException, status

from app.core.config import settings
from app.core.deps import require_doctor
from app.models.user import User
from app.schemas.model_evaluation import ModelEvaluationResponse
from app.services import model_evaluation as evaluation_service

router = APIRouter(prefix="/model-evaluation", tags=["model-evaluation"])


@router.get("/report", response_model=ModelEvaluationResponse)
def model_evaluation_report(
    current_user: User = Depends(require_doctor),
) -> ModelEvaluationResponse:
    """Aggregate test-set evaluation of the classifier (doctors only, no patient data)."""
    try:
        return evaluation_service.get_model_evaluation(
            settings, evaluation_service.DEFAULT_REPORT_PATH
        )
    except evaluation_service.EvaluationReportNotFound:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                "No model evaluation report has been generated yet. "
                f"Run: {evaluation_service.BUILD_COMMAND}"
            ),
        ) from None
    except evaluation_service.EvaluationReportInvalid:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                "The model evaluation report is unreadable or outdated. "
                f"Regenerate it with: {evaluation_service.BUILD_COMMAND}"
            ),
        ) from None
