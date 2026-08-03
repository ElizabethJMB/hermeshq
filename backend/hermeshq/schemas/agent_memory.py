from datetime import datetime

from pydantic import BaseModel, Field


class AgentMemoryWrite(BaseModel):
    memory_key: str = Field(min_length=1, max_length=128)
    title: str = Field(min_length=1, max_length=255)
    content: str = Field(min_length=1)
    category: str | None = None


class AgentMemoryListItem(BaseModel):
    memory_key: str
    title: str
    category: str | None
    updated_at: datetime

    model_config = {"from_attributes": True}


class AgentMemoryRead(AgentMemoryListItem):
    content: str
