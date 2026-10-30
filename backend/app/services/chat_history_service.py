"""Persistence helpers for Health Assistant conversations and messages."""

from __future__ import annotations

from sqlalchemy import desc
from sqlalchemy.orm import Session, joinedload

from app.models.chat_conversation import ChatConversation
from app.models.chat_message import ChatMessage

SENDER_USER = "user"
SENDER_ASSISTANT = "assistant"


def create_conversation(
    db: Session,
    *,
    user_id: int,
    scan_id: int | None,
) -> ChatConversation:
    conversation = ChatConversation(user_id=user_id, scan_id=scan_id)
    db.add(conversation)
    db.commit()
    db.refresh(conversation)
    return conversation


def get_conversation_for_user(
    db: Session,
    conversation_id: int,
    user_id: int,
) -> ChatConversation | None:
    return (
        db.query(ChatConversation)
        .options(joinedload(ChatConversation.messages))
        .filter(
            ChatConversation.id == conversation_id,
            ChatConversation.user_id == user_id,
        )
        .first()
    )


def list_conversations_for_user(
    db: Session,
    *,
    user_id: int,
    scan_id: int | None = None,
    limit: int = 50,
) -> list[ChatConversation]:
    query = db.query(ChatConversation).filter(ChatConversation.user_id == user_id)
    if scan_id is not None:
        query = query.filter(ChatConversation.scan_id == scan_id)
    return (
        query.order_by(desc(ChatConversation.created_at))
        .limit(limit)
        .all()
    )


def add_message(
    db: Session,
    *,
    conversation_id: int,
    sender: str,
    message: str,
) -> ChatMessage:
    row = ChatMessage(
        conversation_id=conversation_id,
        sender=sender,
        message=message,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def list_messages(
    db: Session,
    conversation_id: int,
) -> list[ChatMessage]:
    return (
        db.query(ChatMessage)
        .filter(ChatMessage.conversation_id == conversation_id)
        .order_by(ChatMessage.created_at.asc())
        .all()
    )


def clear_conversation_messages(
    db: Session,
    conversation: ChatConversation,
) -> None:
    (
        db.query(ChatMessage)
        .filter(ChatMessage.conversation_id == conversation.id)
        .delete(synchronize_session=False)
    )
    db.commit()


def delete_conversation(
    db: Session,
    conversation: ChatConversation,
) -> None:
    db.delete(conversation)
    db.commit()


def export_conversation_text(conversation: ChatConversation) -> str:
    lines = [
        "XRaySense AI Health Assistant — Chat Export",
        f"Conversation ID: {conversation.id}",
        f"Scan ID: {conversation.scan_id or 'N/A'}",
        f"Created: {conversation.created_at.isoformat()}",
        "",
        "-" * 48,
        "",
    ]
    messages = sorted(conversation.messages, key=lambda m: m.created_at)
    for msg in messages:
        stamp = msg.created_at.strftime("%Y-%m-%d %H:%M")
        label = "You" if msg.sender == SENDER_USER else "Assistant"
        lines.append(f"[{stamp}] {label}:")
        lines.append(msg.message.strip())
        lines.append("")
    lines.append("-" * 48)
    lines.append(
        "This export is for personal reference. It is not a medical record "
        "and does not replace professional care."
    )
    return "\n".join(lines)
