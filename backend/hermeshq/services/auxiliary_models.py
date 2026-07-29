"""Helpers for encrypting, resolving and sanitizing agent auxiliary_models credentials.

auxiliary_models entries may carry an API key. Plaintext keys must never be
stored in the agents JSONB column nor returned by the API: they are encrypted
with the SecretVault (``api_key_enc`` field, ``enc:v1:`` prefix) and masked
out on serialization.
"""

from typing import Any

from pydantic import BaseModel

from hermeshq.services.secret_vault import SecretVault, decrypt_value, encrypt_value, is_encrypted_value

API_KEY_ENC_FIELD = "api_key_enc"


def encrypt_auxiliary_api_key(vault: SecretVault, plaintext: str) -> str:
    return encrypt_value(vault, plaintext)


def resolve_auxiliary_api_key(vault: SecretVault, cfg: dict[str, Any]) -> str | None:
    """Return the usable API key for an auxiliary_models entry, if any."""
    enc_value = cfg.get(API_KEY_ENC_FIELD)
    if isinstance(enc_value, str) and enc_value:
        if not is_encrypted_value(enc_value):
            return None
        return decrypt_value(vault, enc_value)
    legacy = cfg.get("api_key")
    return legacy if isinstance(legacy, str) and legacy else None


def _entry_to_storage_dict(entry: Any) -> dict[str, Any]:
    if isinstance(entry, BaseModel) and hasattr(entry, "to_dict"):
        return entry.to_dict()
    if isinstance(entry, dict):
        return {k: v for k, v in entry.items() if v is not None}
    return {}


_STORABLE_FIELDS = {"provider", "model", "api_key", "api_key_ref", "base_url", API_KEY_ENC_FIELD}


def encrypt_auxiliary_models(
    incoming: dict[str, Any] | None,
    vault: SecretVault,
    existing: dict[str, Any] | None = None,
) -> dict[str, dict[str, Any]] | None:
    """Build the storage dict for auxiliary_models, encrypting API keys.

    Merge semantics against ``existing`` (update flow):
    - ``api_key`` set to a non-empty string → encrypt and store as api_key_enc.
    - ``api_key`` explicitly empty string → drop any stored key.
    - ``api_key`` absent/None → preserve any previously stored key.
    - explicit ``api_key_ref`` → drop any stored plaintext key (the ref wins).
    """
    if incoming is None:
        return None
    existing = existing or {}
    result: dict[str, dict[str, Any]] = {}
    for task_name, raw_entry in incoming.items():
        entry = {k: v for k, v in _entry_to_storage_dict(raw_entry).items() if k in _STORABLE_FIELDS}
        if not entry:
            continue
        prior = existing.get(task_name) if isinstance(existing.get(task_name), dict) else {}
        new_ref = entry.get("api_key_ref")
        old_ref = prior.get("api_key_ref")
        if "api_key" in entry:
            plaintext = entry.pop("api_key")
            if plaintext:
                entry[API_KEY_ENC_FIELD] = encrypt_auxiliary_api_key(vault, str(plaintext))
            # empty string → drop any previously stored key (no carry-over below)
        elif new_ref and new_ref != old_ref:
            entry.pop(API_KEY_ENC_FIELD, None)
        else:
            for key_field in (API_KEY_ENC_FIELD, "api_key"):
                if key_field in prior and key_field not in entry:
                    entry[key_field] = prior[key_field]
        result[task_name] = entry
    return result or None


def sanitize_auxiliary_models(raw: dict[str, Any] | None) -> dict[str, dict[str, Any]] | None:
    """Strip credential material from auxiliary_models for API responses."""
    if not raw:
        return None
    sanitized: dict[str, dict[str, Any]] = {}
    for task_name, cfg in raw.items():
        if not isinstance(cfg, dict):
            continue
        entry: dict[str, Any] = {}
        for field in ("provider", "model", "api_key_ref", "base_url"):
            value = cfg.get(field)
            if value is not None:
                entry[field] = value
        entry["has_api_key"] = bool(cfg.get(API_KEY_ENC_FIELD) or cfg.get("api_key"))
        sanitized[task_name] = entry
    return sanitized or None


def migrate_auxiliary_models(
    raw: dict[str, Any] | None,
    vault: SecretVault,
) -> tuple[dict[str, Any] | None, bool]:
    """Encrypt any legacy plaintext api_key in-place. Returns (value, changed)."""
    if not raw:
        return raw, False
    changed = False
    migrated: dict[str, Any] = {}
    for task_name, cfg in raw.items():
        if isinstance(cfg, dict):
            cfg = dict(cfg)
            plaintext = cfg.get("api_key")
            if isinstance(plaintext, str) and plaintext:
                cfg[API_KEY_ENC_FIELD] = encrypt_auxiliary_api_key(vault, plaintext)
                cfg.pop("api_key", None)
                changed = True
        migrated[task_name] = cfg
    return migrated, changed
