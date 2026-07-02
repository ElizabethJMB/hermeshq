"""AI Agent Builder router: conversational agent creation via SSE."""

import asyncio
import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from hermeshq.core.security import get_current_user, require_admin
from hermeshq.database import get_db_session
from hermeshq.models.user import User
from hermeshq.schemas.agent_builder import (
    AgentBuilderFinalizeResult,
    AgentBuilderMessage,
    AgentBuilderSessionCreated,
    AgentBuilderTurn,
)
from hermeshq.services.agent_builder import (
    _compute_required_connectors,
    create_builder_session,
    finalize_agent_from_draft,
    get_builder_session,
    process_builder_message,
    purge_expired_sessions,
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/agent-builder/sessions", response_model=AgentBuilderSessionCreated)
async def create_session(
    _user: User = Depends(get_current_user),
):
    """Create a new builder session."""
    purge_expired_sessions()
    session = create_builder_session(tool_mode="inline")
    return AgentBuilderSessionCreated(
        session_id=session.session_id,
        tool_mode=session.tool_mode,
    )


@router.post("/agent-builder/sessions/{session_id}/message")
async def send_message(
    session_id: str,
    payload: AgentBuilderMessage,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    """Send a message to the builder and stream the response via SSE."""
    session = get_builder_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Builder session not found or expired")

    async def event_stream():
        try:
            turn: AgentBuilderTurn = await process_builder_message(
                session, payload.text, db
            )

            if turn.assistant_text:
                chunks = _chunk_text(turn.assistant_text, 80)
                for chunk in chunks:
                    event_data = json.dumps({"type": "delta", "text": chunk})
                    yield f"data: {event_data}\n\n"
                    await asyncio.sleep(0.02)

            turn_data = json.dumps({"type": "turn", "turn": turn.model_dump()})
            yield f"data: {turn_data}\n\n"

        except Exception:
            logger.error("Builder SSE stream error", exc_info=True)
            error_data = json.dumps({"type": "error", "message": "Internal error"})
            yield f"data: {error_data}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/agent-builder/sessions/{session_id}/finalize", response_model=AgentBuilderFinalizeResult)
async def finalize_agent(
    session_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(require_admin),
):
    """Create the agent from the builder draft. Requires admin permissions."""
    session = get_builder_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Builder session not found or expired")

    if not session.draft.friendly_name or not session.draft.system_prompt:
        raise HTTPException(
            status_code=422,
            detail={"error": "Draft is incomplete", "recoverable": True},
        )

    try:
        agent_id, agent_name = await finalize_agent_from_draft(
            session,
            db,
            request.app.state,
            created_by_user_id=str(user.id),
        )
        await db.commit()
    except ValueError as e:
        raise HTTPException(
            status_code=422,
            detail={"error": str(e), "recoverable": True},
        )
    except Exception:
        logger.error("Agent creation from builder failed", exc_info=True)
        raise HTTPException(
            status_code=422,
            detail={"error": "Failed to create agent", "recoverable": True},
        )

    from hermeshq.models.app_settings import AppSettings
    from hermeshq.services.managed_capabilities import list_available_integration_packages

    settings = await db.get(AppSettings, "default")
    enabled = settings.enabled_integration_packages if settings else []
    required = _compute_required_connectors(session.draft, enabled)

    return AgentBuilderFinalizeResult(
        agent_id=agent_id,
        agent_name=agent_name,
        required_connectors=required,
    )


def _chunk_text(text: str, chunk_size: int) -> list[str]:
    """Split text into chunks for streaming, preserving word boundaries."""
    if len(text) <= chunk_size:
        return [text]

    chunks = []
    words = text.split(" ")
    current = ""

    for word in words:
        if len(current) + len(word) + 1 > chunk_size and current:
            chunks.append(current + " ")
            current = word
        else:
            current = current + " " + word if current else word

    if current:
        chunks.append(current)

    return chunks
