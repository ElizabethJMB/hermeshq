"""
Teams Bridge Gateway — Long-polling bridge to a self-hosted Teams relay bot.

Each agent with a microsoft_teams channel enabled gets one TeamsBridgeGateway
instance that polls the configured bot URL for incoming messages, creates tasks
for the agent supervisor, and sends responses back via the proactive endpoint.

Unlike Telegram/WhatsApp (subprocess) and unlike the old Azure Bot webhook
approach, this gateway runs as an asyncio task inside the backend process
(same pattern as Kapso WhatsApp and Google Chat).

Configuration (stored in MessagingChannel):
  secret_ref         → vault key holding the BOT_TOKEN
  metadata_json:
    hermes_id        → unique bridge ID registered with the relay bot
    hermes_desc      → human-readable name shown in /conectar list
    bot_url          → base URL of the relay bot (e.g. https://teams-bot.acme.com)
  allowed_user_ids   → list of Teams user IDs allowed to connect
"""

import asyncio
import logging
import uuid

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from hermeshq.models.agent import Agent
from hermeshq.models.messaging_channel import MessagingChannel
from hermeshq.models.secret import Secret
from hermeshq.models.task import Task
from hermeshq.models.user import User
from hermeshq.services.secret_vault import SecretVault

logger = logging.getLogger(__name__)

POLL_TIMEOUT = 30       # seconds to wait per long-poll request
REGISTER_INTERVAL = 270 # re-register every 4.5 min (under httpx cache TTL)
RETRY_BACKOFF = 10      # seconds to wait after a poll error

_http_client: httpx.AsyncClient | None = None


def _get_http_client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None or _http_client.is_closed:
        _http_client = httpx.AsyncClient(timeout=httpx.Timeout(POLL_TIMEOUT + 15))
    return _http_client


class TeamsBridgeGateway:
    """
    Manages a Teams bridge connection for a single HermesHQ agent.

    Polls the relay bot for incoming Teams messages and routes them as
    Tasks to the agent supervisor. Sends responses back proactively.
    """

    def __init__(
        self,
        agent_id: str,
        session_factory: async_sessionmaker[AsyncSession],
        supervisor: object,
        event_broker: object,
        secret_vault: SecretVault,
    ) -> None:
        self.agent_id = agent_id
        self.session_factory = session_factory
        self.supervisor = supervisor
        self.event_broker = event_broker
        self.secret_vault = secret_vault

        self._running = False
        self._bot_token: str | None = None
        self._hermes_id: str | None = None
        self._hermes_desc: str | None = None
        self._bot_url: str | None = None
        self._allowed_user_ids: list[str] = []
        self._pending_tasks: dict[str, dict] = {}  # task_id → {conversation_id}
        self._poll_task: asyncio.Task | None = None
        self._register_task: asyncio.Task | None = None

    # ---- lifecycle ----

    async def start(self) -> None:
        creds = await self._load_credentials()
        if not creds:
            raise ValueError("Teams bridge credentials not configured")
        self._bot_token, self._hermes_id, self._hermes_desc, self._bot_url, self._allowed_user_ids = creds

        await self._register()

        self._running = True
        self.event_broker.subscribe(self._on_event)
        self._poll_task = asyncio.create_task(self._poll_loop())
        self._register_task = asyncio.create_task(self._register_loop())
        logger.info("Teams bridge gateway started for agent %s (hermes_id=%s)", self.agent_id, self._hermes_id)

    async def stop(self) -> None:
        self._running = False
        self.event_broker.unsubscribe(self._on_event)
        if self._poll_task:
            self._poll_task.cancel()
        if self._register_task:
            self._register_task.cancel()
        self._pending_tasks.clear()
        logger.info("Teams bridge gateway stopped for agent %s", self.agent_id)

    # ---- credential loading ----

    async def _load_credentials(self) -> tuple[str, str, str, str, list[str]] | None:
        async with self.session_factory() as session:
            result = await session.execute(
                select(MessagingChannel).where(
                    MessagingChannel.agent_id == self.agent_id,
                    MessagingChannel.platform == "microsoft_teams",
                )
            )
            channel = result.scalar_one_or_none()
            if not channel or not channel.secret_ref:
                return None

            secret_result = await session.execute(
                select(Secret).where(Secret.name == channel.secret_ref)
            )
            secret = secret_result.scalar_one_or_none()
            if not secret:
                return None

            bot_token = self.secret_vault.decrypt(secret.value_enc)
            if not bot_token:
                return None

            meta = channel.metadata_json or {}
            hermes_id = meta.get("hermes_id", "")
            hermes_desc = meta.get("hermes_desc", "")
            bot_url = (meta.get("bot_url") or "").rstrip("/")

            if not hermes_id or not bot_url:
                logger.error("Teams bridge: missing hermes_id or bot_url in metadata for agent %s", self.agent_id)
                return None

            return bot_token, hermes_id, hermes_desc, bot_url, list(channel.allowed_user_ids or [])

    # ---- relay bot communication ----

    async def _register(self) -> None:
        payload = {
            "hermes_id": self._hermes_id,
            "description": self._hermes_desc,
            "allowed_users": self._allowed_user_ids,
        }
        try:
            client = _get_http_client()
            resp = await client.post(
                f"{self._bot_url}/api/register",
                json=payload,
                headers={"X-Hermes-Token": self._bot_token},
            )
            if resp.status_code == 200:
                logger.info("Teams bridge registered as '%s'", self._hermes_id)
            else:
                logger.error("Teams bridge register failed: HTTP %s", resp.status_code)
        except Exception as exc:
            logger.error("Teams bridge register error: %s", exc)

    async def _register_loop(self) -> None:
        while self._running:
            await asyncio.sleep(REGISTER_INTERVAL)
            if self._running:
                await self._register()

    async def _poll_loop(self) -> None:
        while self._running:
            try:
                client = _get_http_client()
                resp = await client.get(
                    f"{self._bot_url}/api/queue",
                    params={"hermes_id": self._hermes_id, "timeout": POLL_TIMEOUT},
                    headers={"X-Hermes-Token": self._bot_token},
                )
                if resp.status_code == 200:
                    msg = resp.json()
                    asyncio.create_task(self._handle_message(msg))
                elif resp.status_code == 204:
                    pass  # no messages pending
                elif resp.status_code == 404:
                    logger.warning("Teams bridge: bot doesn't recognise hermes_id '%s', re-registering", self._hermes_id)
                    await self._register()
                    await asyncio.sleep(5)
                else:
                    logger.error("Teams bridge poll HTTP %s", resp.status_code)
                    await asyncio.sleep(RETRY_BACKOFF)
            except asyncio.CancelledError:
                break
            except Exception as exc:
                if self._running:
                    logger.error("Teams bridge poll error: %s", exc)
                    await asyncio.sleep(RETRY_BACKOFF)

    async def _send_response(self, conversation_id: str, text: str) -> None:
        try:
            client = _get_http_client()
            resp = await client.post(
                f"{self._bot_url}/api/proactive",
                json={"conversation_id": conversation_id, "response": text},
                headers={"X-Hermes-Token": self._bot_token},
            )
            if resp.status_code != 200:
                logger.error("Teams bridge: proactive send failed HTTP %s", resp.status_code)
        except Exception as exc:
            logger.error("Teams bridge: proactive send error: %s", exc)

    # ---- incoming message handling ----

    async def _handle_message(self, msg: dict) -> None:
        conversation_id = msg.get("conversation_id", "")
        teams_user_id = msg.get("user_id", "")
        user_name = msg.get("user_name", "")
        user_email = msg.get("user_email", "")
        text = (msg.get("message") or "").strip()

        if not text or not teams_user_id:
            return

        # Auto-link Teams user to HermesHQ user on first contact
        hermeshq_user_id = await self._resolve_or_link_user(teams_user_id, user_email)

        task_id = await self._create_task(
            prompt=text,
            teams_user_id=teams_user_id,
            user_name=user_name,
            conversation_id=conversation_id,
            hermeshq_user_id=hermeshq_user_id,
        )
        if task_id:
            self._pending_tasks[task_id] = {"conversation_id": conversation_id}
            logger.info("Teams bridge → agent %s: task %s from %s", self.agent_id, task_id, teams_user_id)

    async def _resolve_or_link_user(self, teams_user_id: str, user_email: str) -> str | None:
        """
        Find the HermesHQ user for this Teams identity.

        1. Try matching by teams_id (already linked).
        2. If not found and user_email present, match by email and auto-link.
        """
        async with self.session_factory() as session:
            # 1. Direct match by teams_id
            result = await session.execute(
                select(User).where(User.teams_id == teams_user_id).limit(1)
            )
            user = result.scalar_one_or_none()
            if user:
                return user.id

            # 2. Auto-link by email (only if another user hasn't claimed this teams_id)
            if user_email:
                email_result = await session.execute(
                    select(User).where(User.email == user_email).limit(1)
                )
                email_user = email_result.scalar_one_or_none()
                if email_user and not email_user.teams_id:
                    email_user.teams_id = teams_user_id
                    await session.commit()
                    logger.info(
                        "Teams bridge: auto-linked user %s (%s) → teams_id %s",
                        email_user.username, user_email, teams_user_id,
                    )
                    return email_user.id

        return None

    async def _create_task(
        self,
        prompt: str,
        teams_user_id: str,
        user_name: str,
        conversation_id: str,
        hermeshq_user_id: str | None,
    ) -> str | None:
        task_id = str(uuid.uuid4())
        async with self.session_factory() as session:
            agent = await session.get(Agent, self.agent_id)
            if not agent or agent.status != "running":
                logger.warning(
                    "Teams bridge: agent %s not running (status=%s), dropping message",
                    self.agent_id,
                    agent.status if agent else "missing",
                )
                return None

            task = Task(
                id=task_id,
                agent_id=self.agent_id,
                title=f"Teams: {user_name or teams_user_id}",
                prompt=prompt,
                status="queued",
                metadata_json={
                    "source": "microsoft_teams",
                    "platform": "microsoft_teams",
                    "teams_user_id": teams_user_id,
                    "teams_user_name": user_name,
                    "teams_conversation_id": conversation_id,
                    "hermeshq_user_id": hermeshq_user_id,
                    "thread_user_id": hermeshq_user_id,
                },
            )
            session.add(task)
            await session.commit()

        await self.supervisor.submit_task(task_id)
        return task_id

    # ---- task completion (event broker) ----

    async def _on_event(self, event: dict) -> None:
        if event.get("type") not in ("task.completed", "task.failed"):
            return

        task_id = event.get("task_id")
        delivery = self._pending_tasks.pop(task_id, None)
        if not delivery:
            return

        if event.get("type") == "task.completed":
            response_text = event.get("response", "")
            if response_text:
                await self._send_response(delivery["conversation_id"], response_text)
        else:
            logger.warning("Teams bridge: task %s failed, no reply sent", task_id)
