from fastapi import APIRouter

from app.routes.ai_chat import router as ai_chat_router
from app.routes.auth import router as auth_router
from app.routes.dashboard import router as dashboard_router
from app.routes.dataset_eda import router as dataset_eda_router
from app.routes.health import router as health_router
from app.routes.health_assistant import router as health_assistant_router
from app.routes.model_evaluation import router as model_evaluation_router
from app.routes.my_scans import router as my_scans_router
from app.routes.patient_invitations import router as patient_invitations_router
from app.routes.patients import router as patients_router
from app.routes.predict import router as predict_router
from app.routes.scan_notes import router as scan_notes_router
from app.routes.scans import router as scans_router

api_router = APIRouter()
api_router.include_router(health_router, tags=["health"])
api_router.include_router(auth_router)
api_router.include_router(dashboard_router)
api_router.include_router(patients_router)
api_router.include_router(patient_invitations_router)
api_router.include_router(my_scans_router)
api_router.include_router(predict_router, tags=["predict"])
api_router.include_router(scans_router)
api_router.include_router(ai_chat_router)
api_router.include_router(scan_notes_router)
api_router.include_router(health_assistant_router)
api_router.include_router(model_evaluation_router)
api_router.include_router(dataset_eda_router)

__all__ = [
    "ai_chat_router",
    "api_router",
    "auth_router",
    "dashboard_router",
    "dataset_eda_router",
    "health_assistant_router",
    "health_router",
    "model_evaluation_router",
    "my_scans_router",
    "patient_invitations_router",
    "patients_router",
    "predict_router",
    "scan_notes_router",
    "scans_router",
]
