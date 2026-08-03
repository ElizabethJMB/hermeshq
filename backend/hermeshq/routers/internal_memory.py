import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from hermeshq.core.security import ensure_agent_access, get_current_user
from hermeshq.database import get_db_session
from hermeshq.models.agent import Agent
from hermeshq.models.user import User
from hermeshq.routers.agents_shared import get_internal_agent
from hermeshq.schemas.agent_memory import AgentMemoryListItem, AgentMemoryRead, AgentMemoryWrite
from hermeshq.services import agent_memory_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/internal/agents/self/memory", tags=["internal-memory"], include_in_schema=False)
admin_router = APIRouter(prefix="/agents", tags=["agents"])


@router.get("", response_model=list[AgentMemoryListItem])
async def list_memory(
    current_agent: Agent = Depends(get_internal_agent),
    db: AsyncSession = Depends(get_db_session),
) -> list[AgentMemoryListItem]:
    entries = await agent_memory_service.list_memories(db, current_agent.id)
    return [AgentMemoryListItem.model_validate(entry) for entry in entries]


@router.get("/{memory_key}", response_model=AgentMemoryRead)
async def read_memory(
    memory_key: str,
    current_agent: Agent = Depends(get_internal_agent),
    db: AsyncSession = Depends(get_db_session),
) -> AgentMemoryRead:
    entry = await agent_memory_service.get_memory(db, current_agent.id, memory_key)
    if not entry:
        raise HTTPException(status_code=404, detail=f"No memory found for key '{memory_key}'")
    return AgentMemoryRead.model_validate(entry)


@router.post("", response_model=AgentMemoryRead)
async def write_memory(
    payload: AgentMemoryWrite,
    current_agent: Agent = Depends(get_internal_agent),
    db: AsyncSession = Depends(get_db_session),
) -> AgentMemoryRead:
    entry = await agent_memory_service.upsert_memory(
        db,
        current_agent.id,
        memory_key=payload.memory_key,
        title=payload.title,
        content=payload.content,
        category=payload.category,
    )
    return AgentMemoryRead.model_validate(entry)


@router.delete("/{memory_key}")
async def delete_memory(
    memory_key: str,
    current_agent: Agent = Depends(get_internal_agent),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, bool]:
    deleted = await agent_memory_service.delete_memory(db, current_agent.id, memory_key)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"No memory found for key '{memory_key}'")
    return {"success": True}


# ---------------------------------------------------------------------------
# Admin/dashboard routes (user auth, scoped by agent access)
# ---------------------------------------------------------------------------


@admin_router.get("/{agent_id}/memory", response_model=list[AgentMemoryListItem])
async def admin_list_memory(
    agent_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> list[AgentMemoryListItem]:
    await ensure_agent_access(db, current_user, agent_id)
    entries = await agent_memory_service.list_memories(db, agent_id)
    return [AgentMemoryListItem.model_validate(entry) for entry in entries]


@admin_router.get("/{agent_id}/memory/{memory_key}", response_model=AgentMemoryRead)
async def admin_read_memory(
    agent_id: str,
    memory_key: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> AgentMemoryRead:
    await ensure_agent_access(db, current_user, agent_id)
    entry = await agent_memory_service.get_memory(db, agent_id, memory_key)
    if not entry:
        raise HTTPException(status_code=404, detail=f"No memory found for key '{memory_key}'")
    return AgentMemoryRead.model_validate(entry)


@admin_router.post("/{agent_id}/memory", response_model=AgentMemoryRead)
async def admin_write_memory(
    agent_id: str,
    payload: AgentMemoryWrite,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> AgentMemoryRead:
    await ensure_agent_access(db, current_user, agent_id)
    entry = await agent_memory_service.upsert_memory(
        db,
        agent_id,
        memory_key=payload.memory_key,
        title=payload.title,
        content=payload.content,
        category=payload.category,
    )
    return AgentMemoryRead.model_validate(entry)


@admin_router.delete("/{agent_id}/memory/{memory_key}")
async def admin_delete_memory(
    agent_id: str,
    memory_key: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict[str, bool]:
    await ensure_agent_access(db, current_user, agent_id)
    deleted = await agent_memory_service.delete_memory(db, agent_id, memory_key)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"No memory found for key '{memory_key}'")
    return {"success": True}
