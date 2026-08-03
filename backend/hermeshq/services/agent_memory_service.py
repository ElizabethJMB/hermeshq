from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from hermeshq.models.agent_memory import AgentMemory


async def list_memories(db: AsyncSession, agent_id: str) -> list[AgentMemory]:
    result = await db.execute(
        select(AgentMemory).where(AgentMemory.agent_id == agent_id).order_by(AgentMemory.updated_at.desc())
    )
    return list(result.scalars().all())


async def get_memory(db: AsyncSession, agent_id: str, memory_key: str) -> AgentMemory | None:
    result = await db.execute(
        select(AgentMemory).where(AgentMemory.agent_id == agent_id, AgentMemory.memory_key == memory_key)
    )
    return result.scalar_one_or_none()


async def upsert_memory(
    db: AsyncSession,
    agent_id: str,
    memory_key: str,
    title: str,
    content: str,
    category: str | None = None,
) -> AgentMemory:
    existing = await get_memory(db, agent_id, memory_key)
    if existing:
        existing.title = title
        existing.content = content
        existing.category = category
        await db.commit()
        await db.refresh(existing)
        return existing

    entry = AgentMemory(
        agent_id=agent_id,
        memory_key=memory_key,
        title=title,
        content=content,
        category=category,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return entry


async def delete_memory(db: AsyncSession, agent_id: str, memory_key: str) -> bool:
    result = await db.execute(
        delete(AgentMemory).where(AgentMemory.agent_id == agent_id, AgentMemory.memory_key == memory_key)
    )
    await db.commit()
    return result.rowcount > 0
