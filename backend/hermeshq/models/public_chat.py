from datetime import datetime
from uuid import uuid4

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from hermeshq.models.base import Base, TimestampMixin, utcnow


class PublicChatApiKey(TimestampMixin, Base):
    __tablename__ = "public_chat_api_keys"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    key_hash: Mapped[str] = mapped_column(String(128), unique=True, nullable=False, index=True)
    key_prefix: Mapped[str] = mapped_column(String(12), nullable=False)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    agent_id: Mapped[str] = mapped_column(ForeignKey("agents.id", ondelete="CASCADE"), index=True)
    allowed_domains: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    requests_per_month: Mapped[int] = mapped_column(Integer, default=1000)
    tokens_per_month: Mapped[int] = mapped_column(Integer, default=100_000)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class PublicChatSession(TimestampMixin, Base):
    __tablename__ = "public_chat_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    api_key_id: Mapped[str] = mapped_column(ForeignKey("public_chat_api_keys.id", ondelete="CASCADE"), index=True)
    agent_id: Mapped[str] = mapped_column(ForeignKey("agents.id", ondelete="CASCADE"), index=True)
    session_token: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), default="active")
    last_activity: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    ttl_minutes: Mapped[int] = mapped_column(Integer, default=10)


class PublicChatMessage(TimestampMixin, Base):
    __tablename__ = "public_chat_messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    session_id: Mapped[str] = mapped_column(ForeignKey("public_chat_sessions.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)


class PublicChatTranscript(Base):
    __tablename__ = "public_chat_transcripts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    session_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    api_key_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    agent_id: Mapped[str] = mapped_column(String(36), nullable=False)
    messages_json: Mapped[list[dict]] = mapped_column(JSON, default=list)
    archived_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
