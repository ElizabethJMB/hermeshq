"""Snapshots del contrato HTTP de /api/auth — la red de seguridad del cutover
de auth-and-identity (fase 1 de la migración).

El orden importa solo para el último test (rate limit): agota el limiter
in-memory del proceso, así que nada de logins después de él.
"""

import os

from ._snapshot import assert_matches_golden, snapshot_of

ADMIN = {"username": "admin", "password": os.environ.get("ADMIN_PASSWORD", "admin-snapshot-1")}


def test_providers_public_shape(client):
    response = client.get("/api/auth/providers")
    assert_matches_golden("providers", snapshot_of(response))


def test_login_success_shape_and_cookie(client):
    response = client.post("/api/auth/login", json=ADMIN)
    assert_matches_golden("login_success", snapshot_of(response, include_cookie=True))


def test_login_wrong_password(client):
    response = client.post("/api/auth/login", json={"username": "admin", "password": "incorrecta"})
    assert_matches_golden("login_wrong_password", snapshot_of(response))


def test_login_unknown_user_same_shape_as_wrong_password(client):
    # Anti-enumeración: debe ser idéntico al de contraseña incorrecta.
    response = client.post("/api/auth/login", json={"username": "fantasma", "password": "x"})
    assert_matches_golden("login_wrong_password", snapshot_of(response))


def test_login_missing_fields_validation(client):
    response = client.post("/api/auth/login", json={"username": "admin"})
    assert_matches_golden("login_missing_fields", snapshot_of(response))


def test_me_authenticated_shape(client, auth_headers):
    response = client.get("/api/auth/me", headers=auth_headers)
    assert_matches_golden("me_authenticated", snapshot_of(response))


def test_me_without_token(client):
    response = client.get("/api/auth/me")
    assert_matches_golden("me_without_token", snapshot_of(response))


def test_me_with_garbage_token(client):
    response = client.get("/api/auth/me", headers={"Authorization": "Bearer basura"})
    assert_matches_golden("me_with_garbage_token", snapshot_of(response))


def test_refresh_shape(client, auth_headers):
    response = client.post("/api/auth/refresh", headers=auth_headers)
    assert_matches_golden("refresh", snapshot_of(response))


def test_update_preferences_shape(client, auth_headers):
    response = client.put(
        "/api/auth/me/preferences",
        json={"theme_preference": "dark", "locale_preference": "en"},
        headers=auth_headers,
    )
    assert_matches_golden("update_preferences", snapshot_of(response))


def test_update_profile_shape(client, auth_headers):
    response = client.put(
        "/api/auth/me/profile",
        json={"display_name": "Snapshot Admin"},
        headers=auth_headers,
    )
    assert_matches_golden("update_profile", snapshot_of(response))


def test_change_password_wrong_current(client, auth_headers):
    response = client.put(
        "/api/auth/me/password",
        json={"current_password": "incorrecta", "new_password": "nueva-clave-9"},
        headers=auth_headers,
    )
    assert_matches_golden("change_password_wrong_current", snapshot_of(response))


def test_mfa_status_shape(client, auth_headers):
    response = client.get("/api/auth/mfa/status", headers=auth_headers)
    assert_matches_golden("mfa_status", snapshot_of(response))


def test_email_config_shape(client, auth_headers):
    response = client.get("/api/auth/email-config", headers=auth_headers)
    assert_matches_golden("email_config", snapshot_of(response))


def test_forgot_password_unknown_email_is_generic(client):
    # Anti-enumeración: respuesta genérica exista o no la cuenta.
    response = client.post("/api/auth/forgot-password", json={"email": "nadie@example.com"})
    assert_matches_golden("forgot_password_unknown_email", snapshot_of(response))


def test_reset_password_invalid_token(client):
    response = client.post(
        "/api/auth/reset-password",
        json={"token": "token-invalido", "new_password": "nueva-clave-9"},
    )
    assert_matches_golden("reset_password_invalid_token", snapshot_of(response))


def test_logout_shape(client, auth_headers):
    response = client.post("/api/auth/logout", headers=auth_headers)
    assert_matches_golden("logout", snapshot_of(response, include_cookie=True))


def test_zz_login_rate_limit_burst(client):
    # ÚLTIMO a propósito: agota el rate limiter in-memory del login.
    responses = [
        client.post("/api/auth/login", json={"username": "admin", "password": "mala"})
        for _ in range(25)
    ]
    limited = next((r for r in responses if r.status_code == 429), None)
    assert limited is not None, "el burst nunca produjo 429 — ¿cambió el rate limit?"
    assert_matches_golden("login_rate_limited", snapshot_of(limited))
