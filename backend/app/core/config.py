"""
Application settings loaded from the repository root `.env` file.
"""

from functools import lru_cache
from pathlib import Path
from typing import Any, List

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/app/core/config.py → CareVision-AI/ (repo root)
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
ENV_FILE = PROJECT_ROOT / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ENV_FILE,
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Application
    app_name: str = Field(default="XRaySense AI", alias="APP_NAME")
    app_env: str = Field(default="development", alias="APP_ENV")
    debug: bool = Field(default=True, alias="DEBUG")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")

    # Backend API
    backend_host: str = Field(default="0.0.0.0", alias="BACKEND_HOST")
    backend_port: int = Field(default=8000, alias="BACKEND_PORT")
    backend_url: str = Field(default="http://localhost:8000", alias="BACKEND_URL")

    # CORS (frontend on localhost)
    cors_origins: str = Field(
        default="http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173",
        alias="CORS_ORIGINS",
    )

    # JWT authentication
    jwt_secret_key: str = Field(
        default="change-me-to-a-long-random-string",
        alias="JWT_SECRET_KEY",
    )
    jwt_algorithm: str = Field(default="HS256", alias="JWT_ALGORITHM")
    access_token_expire_minutes: int = Field(
        default=60,
        alias="ACCESS_TOKEN_EXPIRE_MINUTES",
    )
    refresh_token_expire_days: int = Field(
        default=14,
        alias="REFRESH_TOKEN_EXPIRE_DAYS",
    )
    email_verification_expire_hours: int = Field(
        default=24,
        alias="EMAIL_VERIFICATION_EXPIRE_HOURS",
    )
    password_reset_expire_hours: int = Field(
        default=2,
        alias="PASSWORD_RESET_EXPIRE_HOURS",
    )

    # Google and Microsoft OpenID Connect
    oauth_session_secret: str | None = Field(default=None, alias="OAUTH_SESSION_SECRET")
    google_client_id: str | None = Field(default=None, alias="GOOGLE_CLIENT_ID")
    google_client_secret: str | None = Field(default=None, alias="GOOGLE_CLIENT_SECRET")
    google_redirect_uri: str | None = Field(
        default=None,
        alias="GOOGLE_REDIRECT_URI",
        description="Must match Google Cloud OAuth authorized redirect URI.",
    )
    microsoft_client_id: str | None = Field(default=None, alias="MICROSOFT_CLIENT_ID")
    microsoft_client_secret: str | None = Field(
        default=None,
        alias="MICROSOFT_CLIENT_SECRET",
    )
    microsoft_tenant: str = Field(default="common", alias="MICROSOFT_TENANT")
    microsoft_redirect_uri: str | None = Field(
        default=None,
        alias="MICROSOFT_REDIRECT_URI",
        description="Must match Azure Entra ID redirect URI.",
    )

    @property
    def session_secret(self) -> str:
        return self.oauth_session_secret or self.jwt_secret_key

    @property
    def google_sso_configured(self) -> bool:
        return bool(
            (self.google_client_id or "").strip()
            and (self.google_client_secret or "").strip()
        )

    @property
    def microsoft_sso_configured(self) -> bool:
        return bool(
            (self.microsoft_client_id or "").strip()
            and (self.microsoft_client_secret or "").strip()
        )

    def sso_redirect_uri(self, provider: str) -> str:
        """Return the OAuth redirect URI registered with the identity provider."""
        if provider == "google":
            configured = (self.google_redirect_uri or "").strip()
            if configured:
                return configured
            return f"{self.backend_url.rstrip('/')}/auth/sso/google/callback"
        if provider == "microsoft":
            configured = (self.microsoft_redirect_uri or "").strip()
            if configured:
                return configured
            return f"{self.backend_url.rstrip('/')}/auth/sso/microsoft/callback"
        raise ValueError(f"Unsupported SSO provider: {provider}")

    @model_validator(mode="before")
    @classmethod
    def map_legacy_jwt_env(cls, data: Any) -> Any:
        """Accept SECRET_KEY / ALGORITHM from older .env files."""
        if not isinstance(data, dict):
            return data
        merged = dict(data)
        if not merged.get("JWT_SECRET_KEY"):
            legacy = merged.get("SECRET_KEY")
            if legacy:
                merged["JWT_SECRET_KEY"] = legacy
        if not merged.get("JWT_ALGORITHM"):
            legacy = merged.get("ALGORITHM")
            if legacy:
                merged["JWT_ALGORITHM"] = legacy
        return merged

    # Database
    database_url: str = Field(
        default="postgresql+psycopg2://postgres:pass123@localhost:5432/carevision",
        alias="DATABASE_URL",
    )

    # Uploads & reports
    upload_dir: str = Field(default="./backend/uploads", alias="UPLOAD_DIR")
    max_upload_size_mb: int = Field(default=20, alias="MAX_UPLOAD_SIZE_MB")
    allowed_image_extensions: str = Field(
        default="jpg,jpeg,png,dcm,dicom",
        alias="ALLOWED_IMAGE_EXTENSIONS",
    )
    reports_dir: str = Field(default="./backend/reports", alias="REPORTS_DIR")
    report_logo_path: str | None = Field(
        default=None,
        alias="REPORT_LOGO_PATH",
        description="Optional hospital logo image (PNG/JPG) for PDF letterhead.",
    )
    hospital_name: str = Field(
        default="CareVision Medical Center",
        alias="HOSPITAL_NAME",
    )
    hospital_department: str = Field(
        default="Department of Radiology",
        alias="HOSPITAL_DEPARTMENT",
    )
    hospital_address: str = Field(
        default="123 Healthcare Drive, Medical City",
        alias="HOSPITAL_ADDRESS",
    )
    hospital_phone: str = Field(
        default="+1 (555) 123-4567",
        alias="HOSPITAL_PHONE",
    )

    # Model inference
    model_version: str = Field(
        default="v1.0-efficientnetb0",
        alias="MODEL_VERSION",
        description="Label stored on each scan for audit and reporting.",
    )
    model_path: str = Field(
        default="./backend/model/chest_xray_model.h5",
        alias="MODEL_PATH",
    )
    model_input_size: int = Field(default=224, alias="MODEL_INPUT_SIZE")
    prediction_threshold: float = Field(
        default=0.9,
        alias="PREDICTION_THRESHOLD",
        description=(
            "Deprecated for 3-class softmax models (prediction = argmax). "
            "Kept for compatibility with older binary checkpoints."
        ),
    )
    model_confidence_threshold: float = Field(
        default=0.5,
        alias="MODEL_CONFIDENCE_THRESHOLD",
        description="Deprecated: use PREDICTION_THRESHOLD for inference decisions.",
    )
    enable_image_quality_check: bool = Field(
        default=True,
        alias="ENABLE_IMAGE_QUALITY_CHECK",
        description="Run pre-inference image quality validation on uploads.",
    )
    min_image_dimension: int = Field(
        default=224,
        alias="MIN_IMAGE_DIMENSION",
        description="Minimum width and height (px) required for screening.",
    )
    enable_grad_cam: bool = Field(default=True, alias="ENABLE_GRAD_CAM")
    grad_cam_layer_name: str | None = Field(
        default=None,
        alias="GRAD_CAM_LAYER_NAME",
        description="Optional Keras layer name for Grad-CAM (e.g. top_conv on EfficientNet).",
    )

    @field_validator("cors_origins", mode="before")
    @classmethod
    def strip_cors_origins(cls, value: str) -> str:
        if isinstance(value, str):
            return value
        return ",".join(value)

    @property
    def cors_origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def allowed_extensions_list(self) -> List[str]:
        return [
            ext.strip().lower()
            for ext in self.allowed_image_extensions.split(",")
            if ext.strip()
        ]

    @property
    def upload_path(self) -> Path:
        path = Path(self.upload_dir)
        if not path.is_absolute():
            path = PROJECT_ROOT / path
        return path

    @property
    def reports_path(self) -> Path:
        path = Path(self.reports_dir)
        if not path.is_absolute():
            path = PROJECT_ROOT / path
        return path

    @property
    def resolved_report_logo_path(self) -> Path | None:
        raw = (self.report_logo_path or "").strip()
        if not raw:
            return None
        path = Path(raw)
        if not path.is_absolute():
            path = PROJECT_ROOT / path
        return path if path.is_file() else None

    @property
    def resolved_model_path(self) -> Path:
        path = Path(self.model_path)
        if not path.is_absolute():
            path = PROJECT_ROOT / path
        return path

    # Frontend & patient invitations
    frontend_url: str = Field(
        default="http://localhost:3000",
        alias="FRONTEND_URL",
    )
    public_frontend_url: str | None = Field(
        default=None,
        alias="PUBLIC_FRONTEND_URL",
        description=(
            "Optional public base URL for QR codes / share links "
            "(e.g. http://192.168.1.10:3000). Falls back to FRONTEND_URL."
        ),
    )
    invitation_expire_days: int = Field(default=7, alias="INVITATION_EXPIRE_DAYS")

    # Gemini — Health Assistant (explains reports only; never analyzes X-rays)
    gemini_api_key: str | None = Field(default=None, alias="GEMINI_API_KEY")
    gemini_model: str = Field(
        default="gemini-3.1-flash-lite",
        alias="GEMINI_MODEL",
    )
    gemini_temperature: float = Field(default=0.4, alias="GEMINI_TEMPERATURE")
    gemini_max_output_tokens: int = Field(
        default=2048,
        alias="GEMINI_MAX_OUTPUT_TOKENS",
    )

    # Email (invitation links are logged when SMTP is unset)
    smtp_host: str | None = Field(default=None, alias="SMTP_HOST")
    smtp_port: int = Field(default=587, alias="SMTP_PORT")
    smtp_user: str | None = Field(default=None, alias="SMTP_USER")
    smtp_password: str | None = Field(default=None, alias="SMTP_PASSWORD")
    smtp_from_email: str = Field(
        default="noreply@carevision.local",
        alias="SMTP_FROM_EMAIL",
    )
    smtp_use_tls: bool = Field(default=True, alias="SMTP_USE_TLS")

    @model_validator(mode="before")
    @classmethod
    def map_legacy_frontend_and_smtp_env(cls, data: Any) -> Any:
        """Accept FRONTEND_BASE_URL and SMTP_FROM from older .env files."""
        if not isinstance(data, dict):
            return data
        merged = dict(data)
        if not merged.get("FRONTEND_URL") and not merged.get("frontend_url"):
            legacy = merged.get("FRONTEND_BASE_URL") or merged.get("frontend_base_url")
            if legacy:
                merged["FRONTEND_URL"] = legacy
        if not merged.get("SMTP_FROM_EMAIL") and not merged.get("smtp_from_email"):
            legacy_from = merged.get("SMTP_FROM") or merged.get("smtp_from")
            if legacy_from:
                merged["SMTP_FROM_EMAIL"] = legacy_from
        return merged

    @property
    def smtp_configured(self) -> bool:
        return bool(self.smtp_host and self.smtp_from_email)


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
