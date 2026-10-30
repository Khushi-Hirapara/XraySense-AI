from app.core.config import Settings
from app.services.email import (
    INVITATION_SUBJECT,
    MEDICAL_DISCLAIMER,
    build_invitation_accept_url,
    send_invitation_email,
)


def test_invitation_accept_url_uses_frontend_url_and_path() -> None:
    settings = Settings(FRONTEND_URL="http://localhost:3000")
    url = build_invitation_accept_url(settings, "abc123token")
    assert url == "http://localhost:3000/accept-invitation/abc123token"


def test_invitation_subject() -> None:
    assert INVITATION_SUBJECT == "You're invited to XRaySense AI"


def test_send_without_smtp_returns_skipped() -> None:
    settings = Settings(FRONTEND_URL="http://localhost:3000", SMTP_HOST=None)
    result = send_invitation_email(
        settings,
        to_email="patient@example.com",
        patient_name="Jane",
        doctor_name="Dr. Smith",
        accept_url="http://localhost:3000/accept-invitation/tok",
    )
    assert result.status == "skipped"
    assert result.succeeded is False


def test_medical_disclaimer_present_in_plain_body() -> None:
    from app.services.email import _build_plain_body

    body = _build_plain_body(
        patient_name="Jane",
        doctor_name="Dr. Smith",
        app_name="XRaySense AI",
        accept_url="http://localhost:3000/accept-invitation/tok",
        expire_days=7,
    )
    assert MEDICAL_DISCLAIMER.split(".")[0] in body
