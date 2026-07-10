import asyncio
import hashlib
import logging
import secrets
import time
from collections import defaultdict
from datetime import UTC, datetime

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from hermeshq.models.agent import Agent
from hermeshq.models.conversation_thread import ConversationThread
from hermeshq.models.public_chat import (
    PublicChatApiKey,
    PublicChatMessage,
    PublicChatSession,
    PublicChatTranscript,
)
from hermeshq.models.task import Task
from hermeshq.models.base import utcnow
from hermeshq.services.task_board import next_board_order, runtime_status_to_board_column

logger = logging.getLogger(__name__)

PUBLIC_CHAT_USER_ID = "__public_chat__"


def _hash_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode()).hexdigest()


class SimpleRateLimiter:
    def __init__(self, max_requests: int = 10, window_seconds: int = 60) -> None:
        self._requests: dict[str, list[float]] = defaultdict(list)
        self.max_requests = max_requests
        self.window = window_seconds

    def check(self, key: str) -> bool:
        now = time.time()
        self._requests[key] = [t for t in self._requests[key] if now - t < self.window]
        if len(self._requests[key]) >= self.max_requests:
            return False
        self._requests[key].append(now)
        return True


class PublicChatService:
    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        supervisor: object,
        event_broker: object,
    ) -> None:
        self.session_factory = session_factory
        self.supervisor = supervisor
        self.event_broker = event_broker
        self.rate_limiter = SimpleRateLimiter(max_requests=10, window_seconds=60)

    async def validate_api_key(self, raw_key: str, db: AsyncSession) -> PublicChatApiKey:
        key_hash = _hash_key(raw_key)
        result = await db.execute(
            select(PublicChatApiKey).where(
                PublicChatApiKey.key_hash == key_hash,
                PublicChatApiKey.is_active.is_(True),
            )
        )
        api_key = result.scalar_one_or_none()
        if not api_key:
            raise ValueError("Invalid or inactive API key")
        return api_key

    async def create_session(
        self, api_key: PublicChatApiKey, agent_slug: str | None, db: AsyncSession
    ) -> dict:
        agent_id = api_key.agent_id
        if agent_slug:
            result = await db.execute(
                select(Agent).where(Agent.slug == agent_slug, Agent.is_archived.is_(False))
            )
            agent = result.scalar_one_or_none()
            if agent:
                agent_id = agent.id

        agent = await db.get(Agent, agent_id)
        if not agent:
            raise ValueError("Agent not found")

        session_token = secrets.token_urlsafe(48)
        chat_session = PublicChatSession(
            api_key_id=api_key.id,
            agent_id=agent_id,
            session_token=session_token,
            ttl_minutes=10,
        )
        db.add(chat_session)
        await db.commit()
        await db.refresh(chat_session)

        return {
            "session_id": chat_session.id,
            "session_token": session_token,
            "agent_name": agent.friendly_name or agent.name,
        }

    async def validate_session(
        self, session_id: str, session_token: str, db: AsyncSession
    ) -> PublicChatSession:
        result = await db.execute(
            select(PublicChatSession).where(
                PublicChatSession.id == session_id,
                PublicChatSession.session_token == session_token,
                PublicChatSession.status == "active",
            )
        )
        session = result.scalar_one_or_none()
        if not session:
            raise ValueError("Session not found or inactive")

        now = datetime.now(UTC)
        elapsed = (now - session.last_activity).total_seconds()
        if elapsed > session.ttl_minutes * 60:
            session.status = "expired"
            await db.commit()
            raise ValueError("Session expired")

        return session

    async def send_message(
        self, session_id: str, session_token: str, content: str, db: AsyncSession
    ) -> tuple[str, str]:
        """Returns (task_id, agent_id) for SSE streaming."""
        if not self.rate_limiter.check(session_id):
            raise ValueError("Rate limit exceeded")

        session = await self.validate_session(session_id, session_token, db)
        session.last_activity = utcnow()

        user_msg = PublicChatMessage(
            session_id=session_id,
            role="user",
            content=content,
        )
        db.add(user_msg)

        # Build conversation history from previous messages
        result = await db.execute(
            select(PublicChatMessage)
            .where(PublicChatMessage.session_id == session_id)
            .order_by(PublicChatMessage.created_at.asc())
        )
        previous_messages = result.scalars().all()

        agent = await db.get(Agent, session.agent_id)
        if not agent or agent.status != "running":
            raise ValueError("Agent is not available")

        task = Task(
            agent_id=session.agent_id,
            title="Public chat message",
            prompt=content,
            metadata_json={
                "conversation": True,
                "source": "public_chat",
                "public_session_id": session_id,
                "thread_user_id": PUBLIC_CHAT_USER_ID,
            },
        )
        task.board_column = runtime_status_to_board_column(task.status)
        task.board_order = next_board_order()
        task.board_manual = False
        db.add(task)
        await db.commit()
        await db.refresh(task)

        await self.supervisor.submit_task(task.id)

        return task.id, session.agent_id

    async def save_assistant_message(
        self, session_id: str, content: str
    ) -> None:
        async with self.session_factory() as db:
            msg = PublicChatMessage(
                session_id=session_id,
                role="assistant",
                content=content,
            )
            db.add(msg)
            await db.commit()

    async def close_session(
        self, session_id: str, session_token: str, db: AsyncSession
    ) -> None:
        result = await db.execute(
            select(PublicChatSession).where(
                PublicChatSession.id == session_id,
                PublicChatSession.session_token == session_token,
            )
        )
        session = result.scalar_one_or_none()
        if not session:
            return

        if session.status == "active":
            await self._archive_transcript(session, db)
            session.status = "closed"
            await db.commit()

    async def get_session_status(
        self, session_id: str, session_token: str, db: AsyncSession
    ) -> dict:
        session = await self.validate_session(session_id, session_token, db)
        result = await db.execute(
            select(func.count()).where(PublicChatMessage.session_id == session_id)
        )
        count = result.scalar() or 0
        return {
            "session_id": session.id,
            "status": session.status,
            "created_at": session.created_at,
            "last_activity": session.last_activity,
            "message_count": count,
        }

    async def purge_expired_sessions(self) -> int:
        count = 0
        async with self.session_factory() as db:
            now = datetime.now(UTC)
            result = await db.execute(
                select(PublicChatSession).where(
                    PublicChatSession.status == "active",
                )
            )
            sessions = result.scalars().all()
            for session in sessions:
                elapsed = (now - session.last_activity).total_seconds()
                if elapsed > session.ttl_minutes * 60:
                    await self._archive_transcript(session, db)
                    session.status = "expired"
                    count += 1
            await db.commit()

            # Delete closed/expired sessions older than 1 hour (keep transcripts)
            cutoff = now.replace(hour=now.hour - 1) if now.hour > 0 else now
            await db.execute(
                delete(PublicChatSession).where(
                    PublicChatSession.status.in_(["closed", "expired"]),
                    PublicChatSession.last_activity < cutoff,
                )
            )
            await db.commit()
        return count

    async def _archive_transcript(
        self, session: PublicChatSession, db: AsyncSession
    ) -> None:
        result = await db.execute(
            select(PublicChatMessage)
            .where(PublicChatMessage.session_id == session.id)
            .order_by(PublicChatMessage.created_at.asc())
        )
        messages = result.scalars().all()
        if not messages:
            return

        transcript = PublicChatTranscript(
            session_id=session.id,
            api_key_id=session.api_key_id,
            agent_id=session.agent_id,
            messages_json=[
                {"role": m.role, "content": m.content, "created_at": str(m.created_at)}
                for m in messages
            ],
        )
        db.add(transcript)

    # ── API Key management ──

    async def create_api_key(
        self, label: str, agent_id: str, allowed_domains: list[str],
        requests_per_month: int, tokens_per_month: int, db: AsyncSession,
    ) -> dict:
        agent = await db.get(Agent, agent_id)
        if not agent:
            raise ValueError("Agent not found")

        raw_key = f"pk_live_{secrets.token_urlsafe(32)}"
        key_hash = _hash_key(raw_key)
        key_prefix = raw_key[:12]

        api_key = PublicChatApiKey(
            key_hash=key_hash,
            key_prefix=key_prefix,
            label=label,
            agent_id=agent_id,
            allowed_domains=allowed_domains,
            requests_per_month=requests_per_month,
            tokens_per_month=tokens_per_month,
        )
        db.add(api_key)
        await db.commit()
        await db.refresh(api_key)

        return {
            "id": api_key.id,
            "raw_key": raw_key,
            "key_prefix": key_prefix,
            "label": label,
        }

    async def list_api_keys(self, db: AsyncSession) -> list[PublicChatApiKey]:
        result = await db.execute(
            select(PublicChatApiKey).order_by(PublicChatApiKey.created_at.desc())
        )
        return list(result.scalars().all())

    async def delete_api_key(self, key_id: str, db: AsyncSession) -> None:
        api_key = await db.get(PublicChatApiKey, key_id)
        if not api_key:
            raise ValueError("API key not found")
        api_key.is_active = False
        await db.commit()

    async def list_transcripts(
        self, key_id: str, db: AsyncSession
    ) -> list[PublicChatTranscript]:
        result = await db.execute(
            select(PublicChatTranscript)
            .where(PublicChatTranscript.api_key_id == key_id)
            .order_by(PublicChatTranscript.archived_at.desc())
            .limit(100)
        )
        return list(result.scalars().all())
