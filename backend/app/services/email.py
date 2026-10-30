"""Outbound email helpers (SMTP with dev fallback logging)."""

from __future__ import annotations

import logging
import re
import smtplib
from dataclasses import dataclass
from email.message import EmailMessage

from app.core.config import Settings
from app.core.email_delivery import FAILED, SKIPPED, SENT

logger = logging.getLogger(__name__)

INVITATION_SUBJECT = "You're invited to XRaySense AI"
VERIFY_EMAIL_SUBJECT = "Verify your XRaySense AI email"
RESET_PASSWORD_SUBJECT = "Reset your XRaySense AI password"

MEDICAL_DISCLAIMER = (
    "XRaySense AI provides AI-assisted screening results for clinical review only. "
    "They are not a diagnosis. Always follow guidance from your healthcare provider."
)


@dataclass(frozen=True)
class EmailDeliveryResult:
    status: str
    error_message: str | None = None

    @property
    def succeeded(self) -> bool:
        return self.status == SENT

    @property
    def failed(self) -> bool:
        return self.status == FAILED


def build_invitation_accept_url(settings: Settings, token: str) -> str:
    base = settings.frontend_url.rstrip("/")
    return f"{base}/accept-invitation/{token}"


def _sanitize_error_message(exc: BaseException, settings: Settings) -> str:
    message = str(exc).strip() or exc.__class__.__name__
    secrets = [
        settings.smtp_password,
        settings.smtp_user,
        settings.smtp_from_email,
    ]
    for secret in secrets:
        if secret and secret in message:
            message = message.replace(secret, "***")
    message = re.sub(r"password[=:]\S+", "password=***", message, flags=re.IGNORECASE)
    return message[:500]


def _build_plain_body(
    *,
    patient_name: str,
    doctor_name: str,
    app_name: str,
    accept_url: str,
    expire_days: int,
) -> str:
    return (
        f"Hello {patient_name},\n\n"
        f"{doctor_name} has invited you to join {app_name} to securely view "
        f"your chest X-ray screening results online.\n\n"
        f"Accept your invitation and create your patient portal password:\n"
        f"{accept_url}\n\n"
        f"This link expires in {expire_days} days.\n\n"
        f"Medical disclaimer: {MEDICAL_DISCLAIMER}\n\n"
        f"If you did not expect this invitation, you can ignore this email."
    )


def _build_html_body(
    *,
    patient_name: str,
    doctor_name: str,
    app_name: str,
    accept_url: str,
    expire_days: int,
) -> str:
    return f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="font-family:Segoe UI,Helvetica,Arial,sans-serif;line-height:1.5;color:#1e293b;max-width:560px;margin:0 auto;padding:24px;">
  <p>Hello {patient_name},</p>
  <p><strong>{doctor_name}</strong> has invited you to join <strong>{app_name}</strong> to securely
     view your chest X-ray screening results online.</p>
  <p style="margin:28px 0;">
    <a href="{accept_url}"
       style="display:inline-block;background:#0d9488;color:#ffffff;text-decoration:none;
              font-weight:600;padding:12px 24px;border-radius:8px;">
      Accept invitation
    </a>
  </p>
  <p style="font-size:14px;color:#64748b;">
    Or copy this link into your browser:<br>
    <a href="{accept_url}" style="color:#0d9488;word-break:break-all;">{accept_url}</a>
  </p>
  <p style="font-size:14px;color:#64748b;">This link expires in {expire_days} days.</p>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">
  <p style="font-size:12px;color:#64748b;"><strong>Medical disclaimer:</strong> {MEDICAL_DISCLAIMER}</p>
  <p style="font-size:12px;color:#94a3b8;">If you did not expect this invitation, you can ignore this email.</p>
</body>
</html>"""


def send_invitation_email(
    settings: Settings,
    *,
    to_email: str,
    patient_name: str,
    doctor_name: str,
    accept_url: str,
) -> EmailDeliveryResult:
    """
    Send patient invitation email. Never raises; returns delivery status for persistence/logging.
    """
    plain = _build_plain_body(
        patient_name=patient_name,
        doctor_name=doctor_name,
        app_name=settings.app_name,
        accept_url=accept_url,
        expire_days=settings.invitation_expire_days,
    )
    html = _build_html_body(
        patient_name=patient_name,
        doctor_name=doctor_name,
        app_name=settings.app_name,
        accept_url=accept_url,
        expire_days=settings.invitation_expire_days,
    )

    if not settings.smtp_configured:
        logger.info(
            "Invitation email skipped (SMTP not configured) to=%s accept_url=%s",
            to_email,
            accept_url,
        )
        return EmailDeliveryResult(status=SKIPPED)

    message = EmailMessage()
    message["Subject"] = INVITATION_SUBJECT
    message["From"] = settings.smtp_from_email
    message["To"] = to_email
    message.set_content(plain)
    message.add_alternative(html, subtype="html")

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=30) as server:
            if settings.smtp_use_tls:
                server.starttls()
            if settings.smtp_user and settings.smtp_password:
                server.login(settings.smtp_user, settings.smtp_password)
            server.send_message(message)
        logger.info("Invitation email sent to=%s", to_email)
        return EmailDeliveryResult(status=SENT)
    except Exception as exc:
        safe_message = _sanitize_error_message(exc, settings)
        logger.warning(
            "Invitation email failed to=%s error_type=%s detail=%s",
            to_email,
            type(exc).__name__,
            safe_message,
        )
        return EmailDeliveryResult(status=FAILED, error_message=safe_message)


def _send_email(
    settings: Settings,
    *,
    to_email: str,
    subject: str,
    plain: str,
    html: str,
    skip_log_label: str,
    sent_log_label: str,
    fail_log_label: str,
) -> EmailDeliveryResult:
    if not settings.smtp_configured:
        logger.info("%s (SMTP not configured) to=%s", skip_log_label, to_email)
        return EmailDeliveryResult(status=SKIPPED)

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = settings.smtp_from_email
    message["To"] = to_email
    message.set_content(plain)
    message.add_alternative(html, subtype="html")

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=30) as server:
            if settings.smtp_use_tls:
                server.starttls()
            if settings.smtp_user and settings.smtp_password:
                server.login(settings.smtp_user, settings.smtp_password)
            server.send_message(message)
        logger.info("%s to=%s", sent_log_label, to_email)
        return EmailDeliveryResult(status=SENT)
    except Exception as exc:
        safe_message = _sanitize_error_message(exc, settings)
        logger.warning(
            "%s to=%s error_type=%s detail=%s",
            fail_log_label,
            to_email,
            type(exc).__name__,
            safe_message,
        )
        return EmailDeliveryResult(status=FAILED, error_message=safe_message)


def send_verification_email(
    settings: Settings,
    *,
    to_email: str,
    name: str,
    verify_url: str,
) -> EmailDeliveryResult:
    plain = (
        f"Hello {name},\n\n"
        f"Please verify your email for {settings.app_name}:\n"
        f"{verify_url}\n\n"
        f"This link expires in {settings.email_verification_expire_hours} hours.\n\n"
        f"If you did not create an account, you can ignore this email."
    )
    html = f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="font-family:Segoe UI,Helvetica,Arial,sans-serif;line-height:1.5;color:#1e293b;max-width:560px;margin:0 auto;padding:24px;">
  <p>Hello {name},</p>
  <p>Please verify your email for <strong>{settings.app_name}</strong>.</p>
  <p style="margin:28px 0;">
    <a href="{verify_url}"
       style="display:inline-block;background:#0d9488;color:#ffffff;text-decoration:none;
              font-weight:600;padding:12px 24px;border-radius:8px;">
      Verify email
    </a>
  </p>
  <p style="font-size:14px;color:#64748b;">
    Or copy this link:<br>
    <a href="{verify_url}" style="color:#0d9488;word-break:break-all;">{verify_url}</a>
  </p>
  <p style="font-size:14px;color:#64748b;">
    This link expires in {settings.email_verification_expire_hours} hours.
  </p>
</body>
</html>"""
    if not settings.smtp_configured:
        logger.info(
            "Verification email skipped (SMTP not configured) to=%s verify_url=%s",
            to_email,
            verify_url,
        )
        return EmailDeliveryResult(status=SKIPPED)
    return _send_email(
        settings,
        to_email=to_email,
        subject=VERIFY_EMAIL_SUBJECT,
        plain=plain,
        html=html,
        skip_log_label="Verification email skipped",
        sent_log_label="Verification email sent",
        fail_log_label="Verification email failed",
    )


def send_password_reset_email(
    settings: Settings,
    *,
    to_email: str,
    name: str,
    reset_url: str,
) -> EmailDeliveryResult:
    plain = (
        f"Hello {name},\n\n"
        f"We received a request to reset your {settings.app_name} password:\n"
        f"{reset_url}\n\n"
        f"This link expires in {settings.password_reset_expire_hours} hours.\n\n"
        f"If you did not request a reset, you can ignore this email."
    )
    html = f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="font-family:Segoe UI,Helvetica,Arial,sans-serif;line-height:1.5;color:#1e293b;max-width:560px;margin:0 auto;padding:24px;">
  <p>Hello {name},</p>
  <p>We received a request to reset your <strong>{settings.app_name}</strong> password.</p>
  <p style="margin:28px 0;">
    <a href="{reset_url}"
       style="display:inline-block;background:#0d9488;color:#ffffff;text-decoration:none;
              font-weight:600;padding:12px 24px;border-radius:8px;">
      Reset password
    </a>
  </p>
  <p style="font-size:14px;color:#64748b;">
    Or copy this link:<br>
    <a href="{reset_url}" style="color:#0d9488;word-break:break-all;">{reset_url}</a>
  </p>
  <p style="font-size:14px;color:#64748b;">
    This link expires in {settings.password_reset_expire_hours} hours.
  </p>
</body>
</html>"""
    if not settings.smtp_configured:
        logger.info(
            "Password reset email skipped (SMTP not configured) to=%s reset_url=%s",
            to_email,
            reset_url,
        )
        return EmailDeliveryResult(status=SKIPPED)
    return _send_email(
        settings,
        to_email=to_email,
        subject=RESET_PASSWORD_SUBJECT,
        plain=plain,
        html=html,
        skip_log_label="Password reset email skipped",
        sent_log_label="Password reset email sent",
        fail_log_label="Password reset email failed",
    )
