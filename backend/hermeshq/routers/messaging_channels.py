import logging
import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from hermeshq.core.security import ensure_agent_access, get_current_user, is_admin
from hermeshq.database import get_db_session
from hermeshq.models.agent import Agent
from hermeshq.models.messaging_channel import MessagingChannel
from hermeshq.models.secret import Secret
from hermeshq.models.user import User
from hermeshq.schemas.messaging_channel import (
    ChannelLogsRead,
    MessagingChannelRead,
    MessagingChannelRuntimeRead,
    MessagingChannelUpdate,
)
from hermeshq.services.hermes_installation import HermesInstallationError
from hermeshq.models.activity import ActivityLog
from hermeshq.models.app_settings import AppSettings
from hermeshq.services.secret_vault import SecretVault

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/agents/{agent_id}/channels", tags=["messaging-channels"])
SUPPORTED_PLATFORMS = {"telegram", "whatsapp", "microsoft_teams", "google_chat", "kapso_whatsapp"}


async def _get_or_create_channel(
    db: AsyncSession,
    agent_id: str,
    platform: str,
) -> MessagingChannel:
    result = await db.execute(
        select(MessagingChannel).where(
            MessagingChannel.agent_id == agent_id,
            MessagingChannel.platform == platform,
        )
    )
    channel = result.scalar_one_or_none()
    if channel:
        return channel
    channel = MessagingChannel(agent_id=agent_id, platform=platform)
    db.add(channel)
    await db.flush()
    return channel


def _normalize_string_list(values: list[str]) -> list[str]:
    seen: set[str] = set()
    normalized: list[str] = []
    for value in values:
        item = value.strip()
        if not item or item in seen:
            continue
        seen.add(item)
        normalized.append(item)
    return normalized


async def _secret_exists(db: AsyncSession, secret_ref: str | None) -> bool:
    if not secret_ref:
        return False
    result = await db.execute(select(Secret.id).where(Secret.name == secret_ref))
    return result.scalar_one_or_none() is not None


def _channel_details(
    platform: str,
    secret_ref: str | None,
    extra: dict | None = None,
) -> dict:
    details = {
        "platform": platform,
        "secret_ref": secret_ref,
    }
    if extra:
        details.update(extra)
    return details


async def _log_channel_event(
    db: AsyncSession,
    agent: Agent,
    event_type: str,
    message: str,
    *,
    severity: str = "info",
    details: dict | None = None,
) -> None:
    db.add(
        ActivityLog(
            agent_id=agent.id,
            node_id=agent.node_id,
            event_type=event_type,
            severity=severity,
            message=message,
            details=details or {},
        )
    )


@router.get("", response_model=list[MessagingChannelRead])
async def list_channels(
    agent_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> list[MessagingChannelRead]:
    await ensure_agent_access(db, current_user, agent_id)
    result = await db.execute(
        select(MessagingChannel)
        .where(MessagingChannel.agent_id == agent_id)
        .order_by(MessagingChannel.platform.asc())
    )
    return [MessagingChannelRead.model_validate(item) for item in result.scalars().all()]


@router.put("/{platform}", response_model=MessagingChannelRead)
async def upsert_channel(
    agent_id: str,
    platform: str,
    payload: MessagingChannelUpdate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> MessagingChannelRead:
    agent = await ensure_agent_access(db, current_user, agent_id)
    if platform not in SUPPORTED_PLATFORMS:
        raise HTTPException(status_code=404, detail="Unsupported platform")
    if not is_admin(current_user):
        raise HTTPException(status_code=403, detail="Only admins can modify messaging channels")

    channel = await _get_or_create_channel(db, agent_id, platform)
    previous_secret_ref = channel.secret_ref
    normalized_secret_ref = payload.secret_ref.strip() if payload.secret_ref else None
    secret_exists = await _secret_exists(db, normalized_secret_ref)
    event_prefix = f"channel.{platform}"

    if platform == "telegram":
        if payload.enabled and not normalized_secret_ref:
            await _log_channel_event(
                db,
                agent,
                f"{event_prefix}.config_rejected",
                f"{agent.name} {platform} configuration rejected",
                severity="warning",
                details=_channel_details(platform, normalized_secret_ref, {"reason": "missing_secret_ref"}),
            )
            await db.commit()
            raise HTTPException(status_code=400, detail="Telegram bot token secret is required")
        if (
            normalized_secret_ref
            and not secret_exists
            and (payload.enabled or normalized_secret_ref != previous_secret_ref)
        ):
            await _log_channel_event(
                db,
                agent,
                f"{event_prefix}.config_rejected",
                f"{agent.name} {platform} configuration rejected",
                severity="warning",
                details=_channel_details(platform, normalized_secret_ref, {"reason": "secret_not_found"}),
            )
            await db.commit()
            raise HTTPException(
                status_code=400,
                detail=f"Telegram bot token secret '{normalized_secret_ref}' was not found",
            )

    if platform == "microsoft_teams":
        if payload.enabled and not normalized_secret_ref:
            await _log_channel_event(
                db,
                agent,
                f"{event_prefix}.config_rejected",
                f"{agent.name} {platform} configuration rejected",
                severity="warning",
                details=_channel_details(platform, normalized_secret_ref, {"reason": "missing_secret_ref"}),
            )
            await db.commit()
            raise HTTPException(status_code=400, detail="Teams bot secret is required")
        if (
            normalized_secret_ref
            and not secret_exists
            and (payload.enabled or normalized_secret_ref != previous_secret_ref)
        ):
            await _log_channel_event(
                db,
                agent,
                f"{event_prefix}.config_rejected",
                f"{agent.name} {platform} configuration rejected",
                severity="warning",
                details=_channel_details(platform, normalized_secret_ref, {"reason": "secret_not_found"}),
            )
            await db.commit()
            raise HTTPException(
                status_code=400,
                detail=f"Teams bot secret '{normalized_secret_ref}' was not found",
            )

    if platform == "google_chat":
        if payload.enabled and not normalized_secret_ref:
            await _log_channel_event(
                db,
                agent,
                f"{event_prefix}.config_rejected",
                f"{agent.name} {platform} configuration rejected",
                severity="warning",
                details=_channel_details(platform, normalized_secret_ref, {"reason": "missing_secret_ref"}),
            )
            await db.commit()
            raise HTTPException(status_code=400, detail="Google Chat service account secret is required")
        if (
            normalized_secret_ref
            and not secret_exists
            and (payload.enabled or normalized_secret_ref != previous_secret_ref)
        ):
            await _log_channel_event(
                db,
                agent,
                f"{event_prefix}.config_rejected",
                f"{agent.name} {platform} configuration rejected",
                severity="warning",
                details=_channel_details(platform, normalized_secret_ref, {"reason": "secret_not_found"}),
            )
            await db.commit()
            raise HTTPException(
                status_code=400,
                detail=f"Google Chat service account secret '{normalized_secret_ref}' was not found",
            )

    if platform == "kapso_whatsapp":
        if payload.enabled and not normalized_secret_ref:
            await _log_channel_event(
                db,
                agent,
                f"{event_prefix}.config_rejected",
                f"{agent.name} {platform} configuration rejected",
                severity="warning",
                details=_channel_details(platform, normalized_secret_ref, {"reason": "missing_secret_ref"}),
            )
            await db.commit()
            raise HTTPException(status_code=400, detail="Kapso API key secret is required")
        if (
            normalized_secret_ref
            and not secret_exists
            and (payload.enabled or normalized_secret_ref != previous_secret_ref)
        ):
            await _log_channel_event(
                db,
                agent,
                f"{event_prefix}.config_rejected",
                f"{agent.name} {platform} configuration rejected",
                severity="warning",
                details=_channel_details(platform, normalized_secret_ref, {"reason": "secret_not_found"}),
            )
            await db.commit()
            raise HTTPException(
                status_code=400,
                detail=f"Kapso API key secret '{normalized_secret_ref}' was not found",
            )
        incoming_meta = payload.metadata_json if isinstance(payload.metadata_json, dict) else {}
        if payload.enabled and not incoming_meta.get("kapso_phone_number_id"):
            await _log_channel_event(
                db,
                agent,
                f"{event_prefix}.config_rejected",
                f"{agent.name} {platform} configuration rejected",
                severity="warning",
                details=_channel_details(platform, normalized_secret_ref, {"reason": "missing_phone_number_id"}),
            )
            await db.commit()
            raise HTTPException(status_code=400, detail="kapso_phone_number_id is required in metadata_json")

    channel.enabled = bool(payload.enabled)
    channel.mode = payload.mode or "bidirectional"
    channel.secret_ref = normalized_secret_ref
    channel.allowed_user_ids = _normalize_string_list(payload.allowed_user_ids)
    channel.home_chat_id = payload.home_chat_id.strip() if payload.home_chat_id else None
    channel.home_chat_name = payload.home_chat_name.strip() if payload.home_chat_name else None
    channel.require_mention = bool(payload.require_mention)
    channel.free_response_chat_ids = _normalize_string_list(payload.free_response_chat_ids)
    channel.unauthorized_dm_behavior = payload.unauthorized_dm_behavior or "pair"
    metadata = dict(channel.metadata_json or {})
    incoming_metadata = payload.metadata_json if isinstance(payload.metadata_json, dict) else {}
    for key, value in incoming_metadata.items():
        metadata[key] = value
    channel.metadata_json = metadata

    await db.commit()
    await db.refresh(channel)
    try:
        await request.app.state.installation_manager.sync_agent_installation(agent)
        if channel.enabled:
            await request.app.state.gateway_supervisor.restart_channel(agent_id, platform)
        else:
            await request.app.state.gateway_supervisor.stop_channel(agent_id, platform)
    except (HermesInstallationError, ValueError) as exc:
        channel.status = "error" if channel.enabled else "stopped"
        channel.last_error = str(exc)
        await _log_channel_event(
            db,
            agent,
            f"{event_prefix}.config_updated",
            f"{agent.name} {platform} configuration updated",
            severity="warning",
            details=_channel_details(
                platform,
                channel.secret_ref,
                {"enabled": channel.enabled, "apply_error": str(exc)},
            ),
        )
        await db.commit()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await _log_channel_event(
        db,
        agent,
        f"{event_prefix}.config_updated",
        f"{agent.name} {platform} configuration updated",
        details=_channel_details(platform, channel.secret_ref, {"enabled": channel.enabled}),
    )
    await db.commit()

    result = await db.execute(
        select(MessagingChannel).where(
            MessagingChannel.agent_id == agent_id,
            MessagingChannel.platform == platform,
        )
    )
    return MessagingChannelRead.model_validate(result.scalar_one())


@router.get("/{platform}", response_model=MessagingChannelRead)
async def get_channel(
    agent_id: str,
    platform: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> MessagingChannelRead:
    await ensure_agent_access(db, current_user, agent_id)
    if platform not in SUPPORTED_PLATFORMS:
        raise HTTPException(status_code=404, detail="Unsupported platform")
    channel = await _get_or_create_channel(db, agent_id, platform)
    await db.commit()
    await db.refresh(channel)
    return MessagingChannelRead.model_validate(channel)


@router.get("/{platform}/runtime", response_model=MessagingChannelRuntimeRead)
async def get_channel_runtime(
    agent_id: str,
    platform: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> MessagingChannelRuntimeRead:
    await ensure_agent_access(db, current_user, agent_id)
    if platform not in SUPPORTED_PLATFORMS:
        raise HTTPException(status_code=404, detail="Unsupported platform")
    runtime = await request.app.state.gateway_supervisor.get_runtime_status(agent_id, platform)
    return MessagingChannelRuntimeRead(**runtime)


@router.post("/{platform}/start", response_model=MessagingChannelRuntimeRead)
async def start_channel(
    agent_id: str,
    platform: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> MessagingChannelRuntimeRead:
    await ensure_agent_access(db, current_user, agent_id)
    if platform not in SUPPORTED_PLATFORMS:
        raise HTTPException(status_code=404, detail="Unsupported platform")
    if not is_admin(current_user):
        raise HTTPException(status_code=403, detail="Only admins can start messaging channels")
    try:
        await request.app.state.gateway_supervisor.start_channel(agent_id, platform)
    except (HermesInstallationError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    runtime = await request.app.state.gateway_supervisor.get_runtime_status(agent_id, platform)
    return MessagingChannelRuntimeRead(**runtime)


@router.post("/{platform}/stop", response_model=MessagingChannelRuntimeRead)
async def stop_channel(
    agent_id: str,
    platform: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> MessagingChannelRuntimeRead:
    await ensure_agent_access(db, current_user, agent_id)
    if platform not in SUPPORTED_PLATFORMS:
        raise HTTPException(status_code=404, detail="Unsupported platform")
    if not is_admin(current_user):
        raise HTTPException(status_code=403, detail="Only admins can stop messaging channels")
    await request.app.state.gateway_supervisor.stop_channel(agent_id, platform)
    runtime = await request.app.state.gateway_supervisor.get_runtime_status(agent_id, platform)
    return MessagingChannelRuntimeRead(**runtime)


@router.get("/{platform}/logs", response_model=ChannelLogsRead)
async def get_channel_logs(
    agent_id: str,
    platform: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    await ensure_agent_access(db, current_user, agent_id)
    if platform not in SUPPORTED_PLATFORMS:
        raise HTTPException(status_code=404, detail="Unsupported platform")
    logs = await request.app.state.gateway_supervisor.tail_log(agent_id, platform)
    return {"platform": platform, "content": logs}


class TeamsProvisionResponse(BaseModel):
    hermes_id: str
    secret_ref: str


@router.post("/microsoft_teams/provision-token", response_model=TeamsProvisionResponse)
async def provision_teams_token(
    agent_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> TeamsProvisionResponse:
    """
    Call the relay bot's admin provisioning endpoint to generate a BOT_TOKEN
    for this agent, then store it in the vault and update the channel config.

    Requires teams_bot_url and teams_bot_admin_key_ref to be set in instance settings.
    """
    await ensure_agent_access(db, current_user, agent_id)
    if not is_admin(current_user):
        raise HTTPException(status_code=403, detail="Only admins can provision Teams tokens")

    # Load instance-level Teams bot config
    settings_row = await db.get(AppSettings, "default")
    if not settings_row or not settings_row.teams_bot_url:
        raise HTTPException(status_code=400, detail="Teams bot URL not configured in instance settings")
    if not settings_row.teams_bot_admin_key_ref:
        raise HTTPException(status_code=400, detail="Teams bot admin key not configured in instance settings")

    # Resolve admin key from vault
    secret_vault: SecretVault = request.app.state.secret_vault
    admin_key_secret = await db.execute(
        select(Secret).where(Secret.name == settings_row.teams_bot_admin_key_ref)
    )
    admin_key_row = admin_key_secret.scalar_one_or_none()
    if not admin_key_row:
        raise HTTPException(status_code=400, detail=f"Admin key secret '{settings_row.teams_bot_admin_key_ref}' not found")
    admin_key = secret_vault.decrypt(admin_key_row.value_enc)

    # Load agent to build hermes_id and description
    agent = await db.get(Agent, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    hermes_id = agent.slug or agent.id
    hermes_desc = agent.friendly_name or agent.name or hermes_id
    bot_url = settings_row.teams_bot_url.rstrip("/")

    # Call relay bot to provision token
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{bot_url}/api/admin/tokens",
                json={"hermes_id": hermes_id, "description": hermes_desc},
                headers={"X-Admin-Key": admin_key},
            )
        if resp.status_code == 401:
            raise HTTPException(status_code=400, detail="Teams bot rejected the admin key")
        if resp.status_code != 200:
            raise HTTPException(status_code=400, detail=f"Teams bot provisioning failed: HTTP {resp.status_code}")
        data = resp.json()
        bot_token = data.get("token")
        if not bot_token:
            raise HTTPException(status_code=400, detail="Teams bot returned no token")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not reach Teams bot: {exc}") from exc

    # Store token in vault
    secret_ref = f"teams-token-{hermes_id}"
    existing = await db.execute(select(Secret).where(Secret.name == secret_ref))
    existing_secret = existing.scalar_one_or_none()
    encrypted = secret_vault.encrypt(bot_token)
    if existing_secret:
        existing_secret.value_enc = encrypted
    else:
        new_secret = Secret(name=secret_ref, value_enc=encrypted)
        db.add(new_secret)

    # Update channel metadata
    channel_result = await db.execute(
        select(MessagingChannel).where(
            MessagingChannel.agent_id == agent_id,
            MessagingChannel.platform == "microsoft_teams",
        )
    )
    channel = channel_result.scalar_one_or_none()
    if channel:
        meta = dict(channel.metadata_json or {})
        meta["hermes_id"] = hermes_id
        meta["hermes_desc"] = hermes_desc
        meta["bot_url"] = bot_url
        channel.metadata_json = meta
        channel.secret_ref = secret_ref

    await db.commit()
    return TeamsProvisionResponse(hermes_id=hermes_id, secret_ref=secret_ref)
