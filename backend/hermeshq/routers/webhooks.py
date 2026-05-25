"""
Webhook endpoints for external platform integrations.

Receives incoming events from Google Chat and Kapso WhatsApp
and routes them to the appropriate gateway instances.
"""

import json
import logging

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from hermeshq.database import get_db_session

logger = logging.getLogger(__name__)

router = APIRouter(tags=["webhooks"])


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
    try:
        payload = await request.json()
    except Exception:
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
    except Exception:
        logger.warning("Kapso webhook: invalid JSON payload")
        return {"error": "invalid payload"}

    event_type = payload.get("event", "")
    data = payload.get("data", payload)

    if not event_type:
        # Kapso v2 format: event type in header
        event_type = request.headers.get("X-Webhook-Event", "")
        if not event_type:
            logger.warning("Kapso webhook: missing event type")
            return {"status": "ok"}

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

    # Verify signature — use any gateway's webhook secret if available
    # (All gateways in this deployment share the same webhook endpoint)
    webhook_verified = False
    for gw in kapso_gateways.values():
        if gw._webhook_secret:
            if verify_webhook_signature(body, signature, gw._webhook_secret):
                webhook_verified = True
                break
            else:
                logger.warning("Kapso webhook: signature verification failed")
                return Response(status_code=401, content="Invalid signature")

    if not webhook_verified and signature:
        # Signature was provided but no gateway has a secret configured
        logger.warning(
            "Kapso webhook: signature present but no webhook_secret configured "
            "in any gateway — accepting without verification"
        )

    # Route to the appropriate gateway
    await handle_kapso_webhook(
        event_type=event_type,
        payload=data if data is not payload else payload,
        gateways=kapso_gateways,
    )

    return {"status": "ok"}
