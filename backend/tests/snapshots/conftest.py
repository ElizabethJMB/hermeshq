"""Snapshot suite del comportamiento as-is (blocker B-05 de la migración).

Congela el contrato HTTP observable de los endpoints de auth ANTES de mover
código al repo target. Cualquier refactor/migración debe dejar estos tests
verdes; un cambio semántico intencional debe regenerar goldens con
UPDATE_SNAPSHOTS=1 y justificarse en el PR.
"""

import os

# La configuración debe existir ANTES de importar hermeshq (settings se lee a nivel módulo).
os.environ.setdefault("JWT_SECRET", "snapshot-suite-secret")
os.environ.setdefault("ADMIN_PASSWORD", "admin-snapshot-1")
os.environ.setdefault("ADMIN_USERNAME", "admin")
os.environ.setdefault(
    "DATABASE_URL", "postgresql+asyncpg://hermeshq:hermeshq@localhost:5432/hermeshq"
)

import pytest
from fastapi.testclient import TestClient

from hermeshq.main import app


@pytest.fixture(scope="session")
def client():
    # Context manager: ejecuta el lifespan real (migraciones + bootstrap del admin).
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(scope="session")
def admin_token(client) -> str:
    response = client.post(
        "/api/auth/login",
        json={"username": "admin", "password": os.environ["ADMIN_PASSWORD"]},
    )
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


@pytest.fixture(scope="session")
def auth_headers(admin_token) -> dict:
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="session", autouse=True)
def reset_admin_state(client, auth_headers):
    """Los tests mutan perfil/preferencias del admin; este reset garantiza que
    cada corrida de la suite parta del mismo estado (goldens deterministas)."""
    client.put("/api/auth/me/profile", json={"display_name": "Hermes Operator"}, headers=auth_headers)
    client.put(
        "/api/auth/me/preferences",
        json={"theme_preference": "default", "locale_preference": "default"},
        headers=auth_headers,
    )
