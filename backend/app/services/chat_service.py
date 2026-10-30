"""XRaySense AI Health Assistant orchestration.

Loads the patient's saved report, builds a grounded prompt, calls Gemini,
persists history, and returns structured UI cards. Does not touch the
prediction pipeline.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Any

from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.core.roles import DOCTOR, PATIENT
from app.models.scan import Scan
from app.models.user import User
from app.services.ai_chat import (
    CHAT_DISCLAIMER,
    ScanChatContext,
    build_scan_chat_context,
    generate_scan_chat_answer,
    format_study_date,
)
from app.services.chat_history_service import (
    SENDER_ASSISTANT,
    SENDER_USER,
    add_message,
    create_conversation,
    get_conversation_for_user,
    list_messages,
)
from app.services.emergency_service import get_emergency_response, is_emergency_message
from app.services.gemini_service import (
    GeminiRateLimitError,
    GeminiServiceError,
    generate_gemini_response,
    is_gemini_configured,
)
from app.services.knowledge_service import select_relevant_knowledge
from app.services.prompt_service import (
    PreviousScanSummary,
    SYSTEM_INSTRUCTION,
    build_user_prompt,
)
from app.services.scan_access import (
    get_scan_for_doctor_managed_patient,
    get_scan_for_patient_user,
)
from app.services.scan_comparison import ScanSnapshot, compare_scans
from app.services.scan_note import list_notes_for_scan_report

logger = logging.getLogger(__name__)


_COMPARE_PATTERNS = re.compile(
    r"("
    r"improv(e|ing|ement)|worsen|better|worse|compare|previous\s+scan|"
    r"last\s+scan|am\s+i\s+getting|progress|timeline|before\s+and\s+after"
    r")",
    re.IGNORECASE,
)

_BLOCKED_PATTERNS = re.compile(
    r"\b("
    r"prescribe|prescription|medication\s+for\s+me|what\s+drug\s+should|"
    r"dosage|dose\s+of|"
    r"you\s+have\s+pneumonia|definitely\s+have|confirmed\s+diagnosis|"
    r"final\s+diagnosis|diagnose\s+me"
    r")\b",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class HealthChatResult:
    conversation_id: int
    user_message_id: int
    assistant_message_id: int
    answer: str
    is_emergency: bool
    cards: list[dict[str, Any]]
    disclaimer: str


def resolve_accessible_scan(
    db: Session,
    *,
    user: User,
    scan_id: int,
) -> Scan | None:
    if user.role == DOCTOR:
        return get_scan_for_doctor_managed_patient(db, scan_id, user.id)
    if user.role == PATIENT:
        return get_scan_for_patient_user(db, scan_id, user.id)
    return None


def _get_previous_scan(db: Session, scan: Scan) -> Scan | None:
    if scan.patient_id is None:
        return None
    return (
        db.query(Scan)
        .filter(
            Scan.patient_id == scan.patient_id,
            Scan.id != scan.id,
            Scan.created_at < scan.created_at,
        )
        .order_by(desc(Scan.created_at))
        .first()
    )


def _build_previous_summary(
    db: Session,
    scan: Scan,
    *,
    wants_comparison: bool,
) -> tuple[PreviousScanSummary | None, dict[str, Any] | None]:
    previous = _get_previous_scan(db, scan)
    if previous is None:
        return None, None

    comparison_card: dict[str, Any] | None = None
    comparison_summary: str | None = None

    if wants_comparison:
        result = compare_scans(
            ScanSnapshot(
                id=previous.id,
                created_at=previous.created_at,
                prediction=previous.prediction,  # type: ignore[arg-type]
                confidence=previous.confidence,
                severity=previous.severity,  # type: ignore[arg-type]
                observed_regions=previous.observed_regions or "",
            ),
            ScanSnapshot(
                id=scan.id,
                created_at=scan.created_at,
                prediction=scan.prediction,  # type: ignore[arg-type]
                confidence=scan.confidence,
                severity=scan.severity,  # type: ignore[arg-type]
                observed_regions=scan.observed_regions or "",
            ),
        )
        comparison_summary = result.summary
        comparison_card = {
            "type": "comparison",
            "data": {
                "trend": result.trend,
                "trend_label": result.trend_label,
                "summary": result.summary,
                "earlier": {
                    "scan_id": previous.id,
                    "date": format_study_date(previous.created_at),
                    "prediction": previous.prediction,
                    "confidence_pct": round(previous.confidence * 100, 1),
                    "severity": previous.severity or "None",
                    "findings": previous.ai_findings or "",
                },
                "later": {
                    "scan_id": scan.id,
                    "date": format_study_date(scan.created_at),
                    "prediction": scan.prediction,
                    "confidence_pct": round(scan.confidence * 100, 1),
                    "severity": scan.severity or "None",
                    "findings": scan.ai_findings or "",
                },
            },
        }

    summary = PreviousScanSummary(
        study_date=format_study_date(previous.created_at),
        prediction=previous.prediction,
        confidence_pct=round(previous.confidence * 100, 1),
        severity=previous.severity or "None",
        ai_findings=previous.ai_findings or "Not recorded.",
        comparison_summary=comparison_summary,
    )
    return summary, comparison_card


def _refusal_answer() -> str:
    return (
        "I can help explain your saved screening report and general health education, "
        "but I cannot diagnose conditions, confirm disease, or prescribe medicines. "
        "Please discuss diagnosis and treatment with a qualified healthcare professional.\n\n"
        f"{CHAT_DISCLAIMER}"
    )


def _build_report_cards(
    ctx: ScanChatContext,
    *,
    question: str,
    answer: str,
    comparison_card: dict[str, Any] | None,
    is_emergency: bool,
) -> list[dict[str, Any]]:
    cards: list[dict[str, Any]] = []
    blob = f"{question}\n{answer}".lower()

    if is_emergency:
        cards.append({"type": "emergency", "data": {"message": get_emergency_response()}})

    if any(k in blob for k in ("predict", "result", "report", "screening", "normal", "pneumonia")):
        cards.append(
            {
                "type": "prediction",
                "data": {
                    "prediction": ctx.prediction,
                    "label": ctx.prediction,
                },
            }
        )

    if "confidence" in blob or "%" in answer:
        cards.append(
            {
                "type": "confidence",
                "data": {
                    "confidence_pct": ctx.confidence_pct,
                    "prediction": ctx.prediction,
                },
            }
        )

    if "severity" in blob or ctx.severity.lower() in ("mild", "moderate", "severe"):
        if any(k in blob for k in ("severity", "mild", "moderate", "severe", "report", "explain")):
            cards.append(
                {
                    "type": "severity",
                    "data": {"severity": ctx.severity, "prediction": ctx.prediction},
                }
            )

    if any(k in blob for k in ("recommend", "next step", "follow-up", "follow up", "what should")):
        cards.append(
            {
                "type": "recommendation",
                "data": {
                    "recommendation": ctx.clinical_recommendation,
                    "follow_up": ctx.follow_up_recommendation,
                },
            }
        )

    if any(k in blob for k in ("doctor note", "doctor's note", "notes")) or (
        "note" in blob and "No doctor notes" not in ctx.doctor_notes
    ):
        cards.append(
            {
                "type": "doctor_notes",
                "data": {"notes": ctx.doctor_notes},
            }
        )

    if comparison_card is not None:
        cards.append(comparison_card)

    cards.append({"type": "disclaimer", "data": {"text": CHAT_DISCLAIMER}})

    # Deduplicate by type (keep first)
    seen: set[str] = set()
    unique: list[dict[str, Any]] = []
    for card in cards:
        card_type = str(card.get("type"))
        if card_type in seen:
            continue
        seen.add(card_type)
        unique.append(card)
    return unique


def _ensure_disclaimer(answer: str) -> str:
    if CHAT_DISCLAIMER.lower() in answer.lower() or "not a replacement" in answer.lower():
        return answer.strip()
    if "does not replace" in answer.lower() or "not medical advice" in answer.lower():
        return answer.strip()
    return f"{answer.strip()}\n\n---\n*{CHAT_DISCLAIMER}*"


def process_health_chat(
    db: Session,
    *,
    user: User,
    scan: Scan,
    message: str,
    conversation_id: int | None = None,
) -> HealthChatResult:
    """Main entry: emergency check → context → Gemini → persist → cards."""
    trimmed = message.strip()
    notes = list_notes_for_scan_report(db, scan.id)
    ctx = build_scan_chat_context(scan, notes)

    conversation = None
    if conversation_id is not None:
        conversation = get_conversation_for_user(db, conversation_id, user.id)
        if conversation is None:
            raise ValueError("Conversation not found.")
        if conversation.scan_id and conversation.scan_id != scan.id:
            raise ValueError("Conversation does not belong to this scan.")
    if conversation is None:
        conversation = create_conversation(db, user_id=user.id, scan_id=scan.id)

    user_msg = add_message(
        db,
        conversation_id=conversation.id,
        sender=SENDER_USER,
        message=trimmed,
    )

    wants_comparison = bool(_COMPARE_PATTERNS.search(trimmed))
    previous_summary, comparison_card = _build_previous_summary(
        db, scan, wants_comparison=wants_comparison
    )

    # Emergency path — never call Gemini
    if is_emergency_message(trimmed):
        answer = get_emergency_response()
        assistant_msg = add_message(
            db,
            conversation_id=conversation.id,
            sender=SENDER_ASSISTANT,
            message=answer,
        )
        cards = _build_report_cards(
            ctx,
            question=trimmed,
            answer=answer,
            comparison_card=None,
            is_emergency=True,
        )
        return HealthChatResult(
            conversation_id=conversation.id,
            user_message_id=user_msg.id,
            assistant_message_id=assistant_msg.id,
            answer=answer,
            is_emergency=True,
            cards=cards,
            disclaimer=CHAT_DISCLAIMER,
        )

    if _BLOCKED_PATTERNS.search(trimmed):
        answer = _refusal_answer()
        assistant_msg = add_message(
            db,
            conversation_id=conversation.id,
            sender=SENDER_ASSISTANT,
            message=answer,
        )
        cards = _build_report_cards(
            ctx,
            question=trimmed,
            answer=answer,
            comparison_card=comparison_card,
            is_emergency=False,
        )
        return HealthChatResult(
            conversation_id=conversation.id,
            user_message_id=user_msg.id,
            assistant_message_id=assistant_msg.id,
            answer=answer,
            is_emergency=False,
            cards=cards,
            disclaimer=CHAT_DISCLAIMER,
        )

    knowledge = select_relevant_knowledge(trimmed)
    history_rows = list_messages(db, conversation.id)
    recent = [
        (row.sender, row.message)
        for row in history_rows
        if row.id != user_msg.id
    ][-8:]

    prompt = build_user_prompt(
        question=trimmed,
        scan_ctx=ctx,
        knowledge=knowledge,
        previous=previous_summary,
        recent_messages=recent,
    )

    try:
        if is_gemini_configured():
            raw = generate_gemini_response(
                system_instruction=SYSTEM_INSTRUCTION,
                user_prompt=prompt,
            )
            answer = _ensure_disclaimer(raw)
        else:
            # Safe local fallback when Gemini key is missing
            answer = generate_scan_chat_answer(scan, notes, trimmed)
    except GeminiRateLimitError as exc:
        logger.warning("Gemini free-tier limit reached; using local fallback: %s", exc)
        answer = generate_scan_chat_answer(scan, notes, trimmed)
        answer = (
            f"{answer}\n\n"
            "_Note: The free Gemini service has reached a temporary request "
            "or token limit. A local explanation of your saved report was used "
            "instead. Please wait a moment and try again._"
        )
    except GeminiServiceError as exc:
        logger.warning("Gemini unavailable; using local fallback: %s", exc)
        answer = generate_scan_chat_answer(scan, notes, trimmed)
        answer = (
            f"{answer}\n\n"
            "_Note: Gemini was temporarily unavailable, so a local explanation "
            "of your saved report was used instead._"
        )

    assistant_msg = add_message(
        db,
        conversation_id=conversation.id,
        sender=SENDER_ASSISTANT,
        message=answer,
    )
    cards = _build_report_cards(
        ctx,
        question=trimmed,
        answer=answer,
        comparison_card=comparison_card if wants_comparison else None,
        is_emergency=False,
    )
    return HealthChatResult(
        conversation_id=conversation.id,
        user_message_id=user_msg.id,
        assistant_message_id=assistant_msg.id,
        answer=answer,
        is_emergency=False,
        cards=cards,
        disclaimer=CHAT_DISCLAIMER,
    )


__all__ = [
    "HealthChatResult",
    "process_health_chat",
    "resolve_accessible_scan",
]
