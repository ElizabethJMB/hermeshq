import asyncio
import json
import logging

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from hermeshq.core.security import get_current_user, require_admin
from hermeshq.database import get_db_session
from hermeshq.models.user import User
from hermeshq.schemas.public_chat import (
    ApiKeyCreatedResponse,
    ApiKeyRead,
    CloseSessionRequest,
    CreateApiKeyRequest,
    CreateSessionRequest,
    CreateSessionResponse,
    SendMessageRequest,
    SessionStatusResponse,
    TranscriptRead,
    UpdateApiKeyRequest,
)

logger = logging.getLogger(__name__)

public_router = APIRouter(prefix="/api/public/chat", tags=["public-chat"])
management_router = APIRouter(prefix="/settings/public-chat-keys", tags=["public-chat-management"])


_PUBLIC_ERROR_MAP = {
    "Invalid or inactive API key": ("Invalid or inactive API key", 401),
    "Origin not allowed": ("Access denied", 403),
    "Rate limit exceeded": ("Too many requests, please wait", 429),
    "Monthly request quota exceeded": ("Monthly request limit reached", 429),
    "Too many active sessions": ("Too many active sessions", 429),
    "Session not found or inactive": ("Session unavailable", 400),
    "Session expired": ("Session expired", 400),
    "Agent is not available": ("Service temporarily unavailable", 503),
    "Agent not found": ("Service temporarily unavailable", 503),
}


def _get_service(request: Request):
    return request.app.state.public_chat_service


def _get_client_ip(request: Request) -> str:
    return request.headers.get("x-real-ip") or (request.client.host if request.client else "")


def _public_error(exc: ValueError) -> HTTPException:
    msg = str(exc)
    safe_msg, status = _PUBLIC_ERROR_MAP.get(msg, ("Something went wrong", 400))
    if msg not in _PUBLIC_ERROR_MAP:
        logger.warning("Unmapped public chat error: %s", msg)
    return HTTPException(status_code=status, detail=safe_msg)


# ── Public endpoints (API key + session token auth) ──


@public_router.post("/sessions", response_model=CreateSessionResponse)
async def create_session(
    payload: CreateSessionRequest,
    request: Request,
    x_api_key: str = Header(..., alias="X-Api-Key"),
    db: AsyncSession = Depends(get_db_session),
):
    service = _get_service(request)
    origin = request.headers.get("origin")
    client_ip = _get_client_ip(request)
    try:
        api_key = await service.validate_api_key(x_api_key, db, origin=origin)
    except ValueError as e:
        raise _public_error(e)
    try:
        result = await service.create_session(
            api_key, payload.agent_slug, db, client_ip=client_ip
        )
    except ValueError as e:
        raise _public_error(e)
    return result


@public_router.post("/sessions/{session_id}/messages")
async def send_message(
    session_id: str,
    payload: SendMessageRequest,
    request: Request,
    x_session_token: str = Header(..., alias="X-Session-Token"),
    db: AsyncSession = Depends(get_db_session),
):
    service = _get_service(request)
    client_ip = _get_client_ip(request)
    try:
        task_id, agent_id = await service.send_message(
            session_id, x_session_token, payload.content, db, client_ip=client_ip
        )
    except ValueError as e:
        raise _public_error(e)

    async def sse_stream():
        broker = request.app.state.event_broker
        queue: asyncio.Queue = asyncio.Queue()
        final_response = []

        async def event_handler(event: dict) -> None:
            if event.get("task_id") != task_id:
                return
            event_type = event.get("type", "")
            if event_type == "task.progress":
                await queue.put(("stream", event.get("message", "")))
            elif event_type == "task.completed":
                await queue.put(("done", event.get("response", "")))
            elif event_type == "task.failed":
                raw_error = event.get("error", "Unknown error")
                logger.error("Public chat task %s failed: %s", task_id, raw_error)
                await queue.put(("error", "The agent encountered an error processing your message."))

        broker.subscribe(event_handler)
        try:
            keepalive_count = 0
            while True:
                try:
                    event_type, data = await asyncio.wait_for(queue.get(), timeout=15)
                    keepalive_count = 0
                except asyncio.TimeoutError:
                    keepalive_count += 1
                    if keepalive_count >= 8:
                        yield f"data: {json.dumps({'type': 'timeout'})}\n\n"
                        break
                    yield ": keepalive\n\n"
                    continue

                if event_type == "stream":
                    final_response.append(data)
                    yield f"data: {json.dumps({'type': 'stream', 'content': data})}\n\n"
                elif event_type == "done":
                    full_response = "".join(final_response) if final_response else data
                    yield f"data: {json.dumps({'type': 'done', 'content': full_response})}\n\n"
                    await service.save_assistant_message(session_id, full_response)
                    break
                elif event_type == "error":
                    yield f"data: {json.dumps({'type': 'error', 'content': data})}\n\n"
                    break
        finally:
            broker.unsubscribe(event_handler)

    return StreamingResponse(sse_stream(), media_type="text/event-stream")


@public_router.post("/sessions/{session_id}/close")
async def close_session(
    session_id: str,
    request: Request,
    payload: CloseSessionRequest | None = None,
    x_session_token: str | None = Header(None, alias="X-Session-Token"),
    db: AsyncSession = Depends(get_db_session),
):
    service = _get_service(request)
    token = x_session_token
    if not token and payload:
        token = payload.session_token
    if not token:
        raise HTTPException(status_code=400, detail="Session token required")
    await service.close_session(session_id, token, db)
    return {"status": "closed"}


@public_router.get("/sessions/{session_id}/status", response_model=SessionStatusResponse)
async def session_status(
    session_id: str,
    request: Request,
    x_session_token: str = Header(..., alias="X-Session-Token"),
    db: AsyncSession = Depends(get_db_session),
):
    service = _get_service(request)
    try:
        result = await service.get_session_status(session_id, x_session_token, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return result


# ── Management endpoints (admin-only JWT auth) ──


@management_router.post("", response_model=ApiKeyCreatedResponse)
async def create_api_key(
    payload: CreateApiKeyRequest,
    request: Request,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
):
    service = _get_service(request)
    try:
        result = await service.create_api_key(
            label=payload.label,
            agent_id=payload.agent_id,
            allowed_domains=payload.allowed_domains,
            requests_per_month=payload.requests_per_month,
            tokens_per_month=payload.tokens_per_month,
            db=db,
            widget_title=payload.widget_title,
            widget_theme=payload.widget_theme,
            widget_accent=payload.widget_accent,
            widget_position=payload.widget_position,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return result


@management_router.get("", response_model=list[ApiKeyRead])
async def list_api_keys(
    request: Request,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
):
    service = _get_service(request)
    return await service.list_api_keys(db)


@management_router.patch("/{key_id}", response_model=ApiKeyRead)
async def update_api_key(
    key_id: str,
    payload: UpdateApiKeyRequest,
    request: Request,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
):
    service = _get_service(request)
    try:
        return await service.update_api_key(key_id, payload, db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@management_router.delete("/{key_id}")
async def deactivate_api_key(
    key_id: str,
    request: Request,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
):
    service = _get_service(request)
    try:
        await service.delete_api_key(key_id, db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"status": "deactivated"}


@management_router.delete("/{key_id}/permanent")
async def permanently_delete_api_key(
    key_id: str,
    request: Request,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
):
    service = _get_service(request)
    try:
        await service.permanently_delete_api_key(key_id, db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"status": "deleted"}


@management_router.get("/{key_id}/transcripts", response_model=list[TranscriptRead])
async def list_transcripts(
    key_id: str,
    request: Request,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
):
    service = _get_service(request)
    return await service.list_transcripts(key_id, db)
