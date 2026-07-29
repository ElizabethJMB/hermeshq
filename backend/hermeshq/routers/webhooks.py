"""
Webhook endpoints for external platform integrations.

Receives incoming events from Google Chat and Kapso WhatsApp
and routes them to the appropriate gateway instances.
"""

import json
import logging
import time

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from jose import jwt as jose_jwt
from sqlalchemy.ext.asyncio import AsyncSession

from hermeshq.database import get_db_session

logger = logging.getLogger(__name__)

router = APIRouter(tags=["webhooks"])

# Google Chat signs webhook requests with a JWT from this service account.
_GOOGLE_CHAT_ISSUER = "chat@system.gserviceaccount.com"
_GOOGLE_CHAT_CERTS_URL = "https://www.googleapis.com/service_accounts/v1/metadata/x509/chat@system.gserviceaccount.com"
_GOOGLE_CERTS_CACHE_TTL = 3600
_google_certs_cache: dict = {"certs": None, "fetched_at": 0.0}


async def _fetch_google_chat_certs() -> dict[str, str]:
    """Fetch Google's public certs for the Chat service account (cached 1h)."""
    now = time.time()
    if _google_certs_cache["certs"] is not None and (now - _google_certs_cache["fetched_at"]) < _GOOGLE_CERTS_CACHE_TTL:
        return _google_certs_cache["certs"]
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.get(_GOOGLE_CHAT_CERTS_URL)
        response.raise_for_status()
        certs = response.json()
    _google_certs_cache["certs"] = certs
    _google_certs_cache["fetched_at"] = now
    return certs


async def _verify_google_chat_bearer(request: Request) -> None:
    """Reject requests without a valid Google-issued Bearer JWT.

    Verifies the RS256 signature against the public x509 certificates of the
    Google Chat service account, plus issuer and expiry claims.
    """
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Google Chat bearer token")
    token = auth_header[len("Bearer ") :]
    try:
        certs = await _fetch_google_chat_certs()
    except httpx.HTTPError:
        logger.warning("Google Chat webhook: could not fetch verification certs")
        raise HTTPException(status_code=503, detail="Google Chat cert fetch failed")
    for cert_pem in certs.values():
        try:
            claims = jose_jwt.decode(token, cert_pem, algorithms=["RS256"], options={"verify_aud": False})
        except Exception:  # noqa: BLE001  # try next cert
            continue
        if claims.get("iss") == _GOOGLE_CHAT_ISSUER:
            return
        logger.warning("Google Chat webhook: unexpected token issuer %r", claims.get("iss"))
        break
    raise HTTPException(status_code=401, detail="Invalid Google Chat bearer token")


# ---------------------------------------------------------------------------
# Google Chat webhook
# ---------------------------------------------------------------------------


@router.post("/webhooks/google-chat")
async def google_chat_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db_session),
) -> dict | None:
    """
    Receive incoming events from Google Chat.

    Google Chat sends events to this endpoint when:
    - A user sends a message to the bot
    - The bot is added/removed from a space
    - A card interaction occurs
    """
    await _verify_google_chat_bearer(request)
    try:
        payload = await request.json()
    except (json.JSONDecodeError, TypeError, ValueError):
        return {"error": "invalid payload"}
    gateways = getattr(request.app.state, "google_chat_gateways", {})
    if not gateways:
        logger.warning("Google Chat webhook received but no gateways registered")
        return {"status": "ok"}

    from hermeshq.services.google_chat_gateway import handle_google_chat_webhook

    result = await handle_google_chat_webhook(
        payload=payload,
        session_factory=request.app.state.session_factory,
        gateways=gateways,
    )
    return result or {"status": "ok"}


# ---------------------------------------------------------------------------
# Kapso WhatsApp webhook
# ---------------------------------------------------------------------------


@router.post("/webhooks/kapso-whatsapp")
async def kapso_whatsapp_webhook(
    request: Request,
) -> dict:
    """
    Receive incoming events from Kapso WhatsApp platform.

    Kapso sends webhook events for:
    - whatsapp.message.received — new message from customer
    - whatsapp.message.sent — message sent confirmation
    - whatsapp.message.delivered — delivery confirmation
    - whatsapp.message.read — read receipt
    - whatsapp.message.failed — delivery failure
    - whatsapp.conversation.created / ended / inactive
    """
    # Read raw body for signature verification
    body = await request.body()

    try:
        payload = json.loads(body)
    except (json.JSONDecodeError, TypeError, ValueError):
        logger.warning("Kapso webhook: invalid JSON payload")
        return {"error": "invalid payload"}

    # Normalize to list — Kapso may send a single event (dict) or a batch (list)
    raw_events: list[dict] = payload if isinstance(payload, list) else [payload]

    # Get Kapso gateways from app state
    kapso_gateways = getattr(request.app.state, "kapso_gateways", {})
    if not kapso_gateways:
        logger.warning("Kapso webhook received but no gateways registered")
        return {"status": "ok"}

    # Verify webhook signature if available
    signature = request.headers.get("X-Webhook-Signature", "")

    from hermeshq.services.kapso_whatsapp_gateway import (
        handle_kapso_webhook,
        verify_webhook_signature,
    )

    # Verify signature using raw body (before parsing).
    # Fail-closed: if no gateway has a webhook secret configured, the event
    # cannot be authenticated and must be rejected.
    gateways_with_secret = [gw for gw in kapso_gateways.values() if gw._webhook_secret]
    if gateways_with_secret:
        if not signature:
            logger.warning("Kapso webhook: missing X-Webhook-Signature header — rejecting")
            return Response(status_code=401, content="Missing webhook signature")
        verified = any(verify_webhook_signature(body, signature, gw._webhook_secret) for gw in gateways_with_secret)
        if not verified:
            logger.warning("Kapso webhook: signature verification failed")
            return Response(status_code=401, content="Invalid signature")
    else:
        logger.error(
            "Kapso webhook: no webhook_secret configured on any gateway — rejecting unauthenticated event. "
            "Configure a webhook secret in the Kapso channel settings."
        )
        return Response(status_code=503, content="Webhook secret not configured")

    # Process each event (single or batch)
    for event_data in raw_events:
        event_type = event_data.get("event", "")
        data = event_data.get("data", event_data)

        if not event_type:
            event_type = request.headers.get("X-Webhook-Event", "")
            if not event_type:
                logger.warning("Kapso webhook: skipping event without type")
                continue

        await handle_kapso_webhook(
            event_type=event_type,
            payload=data if data is not event_data else event_data,
            gateways=kapso_gateways,
        )

    return {"status": "ok"}
