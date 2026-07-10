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


class ApiKeyRead(ORMModel):
    id: str
    key_prefix: str
    label: str
    agent_id: str
    allowed_domains: list[str]
    requests_per_month: int
    tokens_per_month: int
    is_active: bool
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
