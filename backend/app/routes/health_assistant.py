"""XRaySense AI Health Assistant API routes."""

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import get_db
from app.models.user import User
from app.schemas.health_assistant import (
    ChatConversationDetail,
    ChatConversationListResponse,
    ChatConversationSummary,
    ChatMessageResponse,
    HealthChatCard,
    HealthChatRequest,
    HealthChatResponse,
    KnowledgeArticleResponse,
    KnowledgeListResponse,
    KnowledgeTopicResponse,
)
from app.services import chat_history_service as history
from app.services.chat_service import process_health_chat, resolve_accessible_scan
from app.services.knowledge_service import get_article_by_id, list_knowledge_topics

router = APIRouter(prefix="/health-assistant", tags=["health-assistant"])


def _not_found(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)


def _bad_request(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)


@router.post("/chat", response_model=HealthChatResponse)
def health_assistant_chat(
    body: HealthChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> HealthChatResponse:
    """Ask the Health Assistant about a saved scan report (Gemini-backed)."""
    scan = resolve_accessible_scan(db, user=current_user, scan_id=body.scan_id)
    if scan is None:
        raise _not_found(f"Scan {body.scan_id} not found or access denied.")

    try:
        result = process_health_chat(
            db,
            user=current_user,
            scan=scan,
            message=body.message,
            conversation_id=body.conversation_id,
        )
    except ValueError as exc:
        raise _bad_request(str(exc)) from exc

    return HealthChatResponse(
        conversation_id=result.conversation_id,
        user_message_id=result.user_message_id,
        assistant_message_id=result.assistant_message_id,
        answer=result.answer,
        is_emergency=result.is_emergency,
        cards=[HealthChatCard(**card) for card in result.cards],
        disclaimer=result.disclaimer,
    )


@router.get("/conversations", response_model=ChatConversationListResponse)
def list_my_conversations(
    scan_id: int | None = Query(default=None, ge=1),
    limit: int = Query(default=30, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ChatConversationListResponse:
    rows = history.list_conversations_for_user(
        db,
        user_id=current_user.id,
        scan_id=scan_id,
        limit=limit,
    )
    items: list[ChatConversationSummary] = []
    for row in rows:
        messages = history.list_messages(db, row.id)
        preview = None
        for msg in reversed(messages):
            if msg.sender == history.SENDER_USER:
                preview = msg.message[:120]
                break
        items.append(
            ChatConversationSummary(
                id=row.id,
                user_id=row.user_id,
                scan_id=row.scan_id,
                created_at=row.created_at,
                message_count=len(messages),
                preview=preview,
            )
        )
    return ChatConversationListResponse(items=items, total=len(items))


@router.get("/conversations/{conversation_id}", response_model=ChatConversationDetail)
def get_conversation(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ChatConversationDetail:
    conversation = history.get_conversation_for_user(
        db, conversation_id, current_user.id
    )
    if conversation is None:
        raise _not_found("Conversation not found.")

    messages = history.list_messages(db, conversation.id)
    return ChatConversationDetail(
        id=conversation.id,
        user_id=conversation.user_id,
        scan_id=conversation.scan_id,
        created_at=conversation.created_at,
        messages=[ChatMessageResponse.model_validate(m) for m in messages],
    )


@router.delete("/conversations/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_conversation(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    conversation = history.get_conversation_for_user(
        db, conversation_id, current_user.id
    )
    if conversation is None:
        raise _not_found("Conversation not found.")
    history.delete_conversation(db, conversation)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/conversations/{conversation_id}/clear",
    status_code=status.HTTP_204_NO_CONTENT,
)
def clear_conversation(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    conversation = history.get_conversation_for_user(
        db, conversation_id, current_user.id
    )
    if conversation is None:
        raise _not_found("Conversation not found.")
    history.clear_conversation_messages(db, conversation)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/conversations/{conversation_id}/export")
def export_conversation(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    conversation = history.get_conversation_for_user(
        db, conversation_id, current_user.id
    )
    if conversation is None:
        raise _not_found("Conversation not found.")
    # Ensure messages are loaded
    conversation.messages = history.list_messages(db, conversation.id)
    text = history.export_conversation_text(conversation)
    filename = f"carevision-chat-{conversation_id}.txt"
    return Response(
        content=text,
        media_type="text/plain; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/knowledge", response_model=KnowledgeListResponse)
def list_knowledge(
    current_user: User = Depends(get_current_user),
) -> KnowledgeListResponse:
    _ = current_user
    items = [
        KnowledgeTopicResponse(**topic) for topic in list_knowledge_topics()
    ]
    return KnowledgeListResponse(items=items)


@router.get("/knowledge/{article_id}", response_model=KnowledgeArticleResponse)
def get_knowledge_article(
    article_id: str,
    current_user: User = Depends(get_current_user),
) -> KnowledgeArticleResponse:
    _ = current_user
    article = get_article_by_id(article_id)
    if article is None:
        raise _not_found("Knowledge article not found.")
    return KnowledgeArticleResponse(
        id=article.id,
        topic=article.topic,
        title=article.title,
        summary=article.summary,
        content=article.content,
    )
