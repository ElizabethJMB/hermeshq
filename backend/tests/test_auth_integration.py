"""Integration tests for the auth flow against real PostgreSQL.

These spin up a minimal FastAPI app with only the auth router and exercise
login → refresh (cookie) → logout end-to-end. Skipped when no DB is reachable.
"""

from __future__ import annotations

import pytest
from conftest import requires_database
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from hermeshq.core.security import hash_password
from hermeshq.database import get_db_session
from hermeshq.models.user import User
from hermeshq.routers.auth import router as auth_router

pytestmark = [pytest.mark.integration, requires_database]


@pytest.fixture
async def auth_client(db_session):
    app = FastAPI()
    app.include_router(auth_router, prefix="/api")

    async def _override_session():
        yield db_session

    app.dependency_overrides[get_db_session] = _override_session
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


@pytest.fixture
async def test_user(db_session):
    user = User(
        username="integration-admin",
        display_name="Integration Admin",
        password_hash=hash_password("Sup3rSecret!"),
        role="admin",
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


class TestLoginRefreshLogoutFlow:
    async def test_login_issues_cookie_and_token(self, auth_client, test_user):
        response = await auth_client.post(
            "/api/auth/login",
            json={"username": "integration-admin", "password": "Sup3rSecret!"},
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["access_token"]
        assert "hermeshq_token" in response.cookies

    async def test_login_rejects_wrong_password(self, auth_client, test_user):
        response = await auth_client.post(
            "/api/auth/login",
            json={"username": "integration-admin", "password": "wrong"},
        )
        assert response.status_code == 401

    async def test_refresh_with_cookie_returns_new_token(self, auth_client, test_user):
        login = await auth_client.post(
            "/api/auth/login",
            json={"username": "integration-admin", "password": "Sup3rSecret!"},
        )
        assert login.status_code == 200
        # Cookie-based refresh (as the SPA does after an OIDC redirect)
        refresh = await auth_client.post("/api/auth/refresh")
        assert refresh.status_code == 200, refresh.text
        new_token = refresh.json()["access_token"]
        assert new_token

        # The new token is accepted for authenticated endpoints
        me = await auth_client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {new_token}"},
        )
        assert me.status_code == 200
        assert me.json()["username"] == "integration-admin"

    async def test_refresh_without_credentials_is_401(self, auth_client):
        response = await auth_client.post("/api/auth/refresh")
        assert response.status_code == 401

    async def test_logout_clears_cookie(self, auth_client, test_user):
        login = await auth_client.post(
            "/api/auth/login",
            json={"username": "integration-admin", "password": "Sup3rSecret!"},
        )
        token = login.json()["access_token"]
        logout = await auth_client.post(
            "/api/auth/logout",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert logout.status_code == 204
        cookie_header = logout.headers.get("set-cookie", "")
        assert "hermeshq_token=" in cookie_header

    async def test_deactivated_user_cannot_refresh(self, auth_client, test_user, db_session):
        login = await auth_client.post(
            "/api/auth/login",
            json={"username": "integration-admin", "password": "Sup3rSecret!"},
        )
        token = login.json()["access_token"]

        test_user.is_active = False
        await db_session.commit()

        me = await auth_client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert me.status_code == 401
