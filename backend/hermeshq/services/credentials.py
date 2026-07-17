"""Shared secret resolution — one place that turns a secret name into a value."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from hermeshq.models.secret import Secret
from hermeshq.services.secret_vault import SecretVault


async def resolve_secret_value(
    session: AsyncSession,
    vault: SecretVault,
    name: str | None,
) -> str | None:
    """Return the decrypted value of the named secret, or None if unset/missing."""
    if not name:
        return None
    result = await session.execute(select(Secret).where(Secret.name == name))
    secret = result.scalar_one_or_none()
    if not secret:
        return None
    return vault.decrypt(secret.value_enc)


async def require_secret_value(
    session: AsyncSession,
    vault: SecretVault,
    name: str,
    error_type: type[Exception] = ValueError,
) -> str:
    """Like :func:`resolve_secret_value` but raises ``error_type`` when missing."""
    value = await resolve_secret_value(session, vault, name)
    if value is None:
        raise error_type(f"Secret '{name}' was not found")
    return value
