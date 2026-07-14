from datetime import datetime

from pydantic import BaseModel, Field

from hermeshq.schemas.common import ORMModel


class CreateSessionRequest(BaseModel):
    agent_slug: str | None = None


class CreateSessionResponse(BaseModel):
    session_id: str
    session_token: str
    agent_name: str


class SendMessageRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=4000)


class CloseSessionRequest(BaseModel):
    session_token: str


class SessionStatusResponse(BaseModel):
    session_id: str
    status: str
    created_at: datetime
    last_activity: datetime
    message_count: int


class PublicChatMessageRead(BaseModel):
    role: str
    content: str
    created_at: datetime


class CreateApiKeyRequest(BaseModel):
    label: str
    agent_id: str
    allowed_domains: list[str] = Field(default_factory=list)
    requests_per_month: int = 1000
    tokens_per_month: int = 100_000
    widget_title: str | None = None
    widget_theme: str = "auto"
    widget_accent: str = "#6366f1"
    widget_position: str = "right"


class UpdateApiKeyRequest(BaseModel):
    label: str | None = None
    allowed_domains: list[str] | None = None
    requests_per_month: int | None = None
    tokens_per_month: int | None = None
    is_active: bool | None = None
    widget_title: str | None = None
    widget_theme: str | None = None
    widget_accent: str | None = None
    widget_position: str | None = None


class ApiKeyRead(ORMModel):
    id: str
    key_prefix: str
    label: str
    agent_id: str
    allowed_domains: list[str]
    requests_per_month: int
    tokens_per_month: int
    is_active: bool
    widget_title: str | None
    widget_theme: str
    widget_accent: str
    widget_position: str
    created_at: datetime


class ApiKeyCreatedResponse(BaseModel):
    id: str
    raw_key: str
    key_prefix: str
    label: str


class TranscriptRead(ORMModel):
    id: str
    session_id: str
    agent_id: str
    messages_json: list[dict]
    archived_at: datetime
