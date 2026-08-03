"""Integration tests for per-agent persistent memory (service + internal router)."""

from __future__ import annotations

import pytest
from conftest import requires_database
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from hermeshq.core.security import create_agent_service_token
from hermeshq.database import get_db_session
from hermeshq.models.agent import Agent
from hermeshq.models.node import Node
from hermeshq.routers.internal_memory import router as internal_memory_router
from hermeshq.services import agent_memory_service

pytestmark = [pytest.mark.integration, requires_database]


async def _make_agent(db_session, *, slug: str) -> Agent:
    node = Node(name=f"node-{slug}", hostname="localhost")
    db_session.add(node)
    await db_session.commit()
    await db_session.refresh(node)

    agent = Agent(
        node_id=node.id,
        name=slug,
        slug=slug,
        workspace_path=f"/tmp/{slug}",
    )
    db_session.add(agent)
    await db_session.commit()
    await db_session.refresh(agent)
    return agent


@pytest.fixture
async def agent_a(db_session):
    return await _make_agent(db_session, slug="agent-a")


@pytest.fixture
async def agent_b(db_session):
    return await _make_agent(db_session, slug="agent-b")


@pytest.fixture
async def memory_client(db_session):
    app = FastAPI()
    app.include_router(internal_memory_router, prefix="/api")

    async def _override_session():
        yield db_session

    app.dependency_overrides[get_db_session] = _override_session
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


class TestAgentMemoryService:
    async def test_upsert_creates_and_updates(self, db_session, agent_a):
        created = await agent_memory_service.upsert_memory(
            db_session, agent_a.id, "user_prefs", "User preferences", "Likes short answers", category="user"
        )
        assert created.title == "User preferences"

        updated = await agent_memory_service.upsert_memory(
            db_session, agent_a.id, "user_prefs", "User preferences", "Likes very short answers", category="user"
        )
        assert updated.id == created.id
        assert updated.content == "Likes very short answers"

        entries = await agent_memory_service.list_memories(db_session, agent_a.id)
        assert len(entries) == 1

    async def test_delete(self, db_session, agent_a):
        await agent_memory_service.upsert_memory(db_session, agent_a.id, "k", "T", "C")
        assert await agent_memory_service.delete_memory(db_session, agent_a.id, "k") is True
        assert await agent_memory_service.delete_memory(db_session, agent_a.id, "k") is False
        assert await agent_memory_service.get_memory(db_session, agent_a.id, "k") is None


class TestInternalMemoryRouterAuth:
    async def test_missing_credentials_rejected(self, memory_client):
        response = await memory_client.get("/api/internal/agents/self/memory")
        assert response.status_code == 401

    async def test_invalid_token_rejected(self, memory_client, agent_a):
        response = await memory_client.get(
            "/api/internal/agents/self/memory",
            headers={"X-HermesHQ-Agent-ID": agent_a.id, "X-HermesHQ-Agent-Token": "bad-token"},
        )
        assert response.status_code == 401

    async def test_write_read_list_delete_roundtrip(self, memory_client, agent_a):
        headers = {
            "X-HermesHQ-Agent-ID": agent_a.id,
            "X-HermesHQ-Agent-Token": create_agent_service_token(agent_a.id),
        }

        write_resp = await memory_client.post(
            "/api/internal/agents/self/memory",
            json={"memory_key": "user_prefs", "title": "Prefs", "content": "Be terse", "category": "user"},
            headers=headers,
        )
        assert write_resp.status_code == 200, write_resp.text

        list_resp = await memory_client.get("/api/internal/agents/self/memory", headers=headers)
        assert list_resp.status_code == 200
        assert [item["memory_key"] for item in list_resp.json()] == ["user_prefs"]

        read_resp = await memory_client.get("/api/internal/agents/self/memory/user_prefs", headers=headers)
        assert read_resp.status_code == 200
        assert read_resp.json()["content"] == "Be terse"

        delete_resp = await memory_client.delete("/api/internal/agents/self/memory/user_prefs", headers=headers)
        assert delete_resp.status_code == 200

        missing_resp = await memory_client.get("/api/internal/agents/self/memory/user_prefs", headers=headers)
        assert missing_resp.status_code == 404

    async def test_agent_cannot_read_other_agents_memory(self, memory_client, agent_a, agent_b):
        headers_a = {
            "X-HermesHQ-Agent-ID": agent_a.id,
            "X-HermesHQ-Agent-Token": create_agent_service_token(agent_a.id),
        }
        headers_b = {
            "X-HermesHQ-Agent-ID": agent_b.id,
            "X-HermesHQ-Agent-Token": create_agent_service_token(agent_b.id),
        }

        await memory_client.post(
            "/api/internal/agents/self/memory",
            json={"memory_key": "secret_note", "title": "Secret", "content": "only agent A"},
            headers=headers_a,
        )

        list_as_b = await memory_client.get("/api/internal/agents/self/memory", headers=headers_b)
        assert list_as_b.json() == []

        read_as_b = await memory_client.get("/api/internal/agents/self/memory/secret_note", headers=headers_b)
        assert read_as_b.status_code == 404
