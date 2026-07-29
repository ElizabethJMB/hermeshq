"""MFA endpoints and helpers for the auth router package."""

import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from hermeshq.config import get_settings
from hermeshq.core.security import create_access_token, get_current_user
from hermeshq.database import get_db_session
from hermeshq.models.app_settings import AppSettings
from hermeshq.models.mfa_code import MfaCode
from hermeshq.models.user import User
from hermeshq.schemas.auth import (
    MfaRequiredResponse,
    MfaResendRequest,
    MfaStatusResponse,
    MfaVerifyRequest,
    TokenResponse,
)
from hermeshq.services.email_service import EmailServiceError, get_email_service

from .helpers import (
    MFA_CODE_EXPIRY_MINUTES,
    MFA_CODE_MAX_ATTEMPTS,
    MFA_RESEND_COOLDOWN_SECONDS,
    _set_auth_cookie,
    logger,
)

router = APIRouter()


async def _is_mfa_globally_enabled(db: AsyncSession) -> bool:
    """Check if MFA via email is enabled in global app settings."""
    result = await db.execute(select(AppSettings).where(AppSettings.id == "default"))
    app_settings = result.scalar_one_or_none()
    if not app_settings:
        return False
    return bool(app_settings.mfa_email_enabled)


def _create_mfa_token(user_id: str) -> tuple[str, datetime]:
    """Create a short-lived JWT token for MFA verification step."""
    settings = get_settings()
    expires_at = datetime.now(UTC) + timedelta(minutes=MFA_CODE_EXPIRY_MINUTES)
    payload = {
        "sub": user_id,
        "sub_kind": "id",
        "mfa_pending": True,
        "exp": expires_at,
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    return token, expires_at


def _verify_mfa_token(mfa_token: str) -> str | None:
    """Verify a MFA token and return the user_id, or None if invalid."""
    try:
        settings = get_settings()
        payload = jwt.decode(mfa_token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        if not payload.get("mfa_pending"):
            return None
        return payload.get("sub")
    except JWTError:
        return None


def _generate_mfa_code() -> str:
    """Generate a random 6-digit code."""
    return f"{secrets.randbelow(1_000_000):06d}"


def _mask_email(email: str | None) -> str | None:
    """Mask email for display: a***@domain.com"""
    if not email or "@" not in email:
        return email
    local, domain = email.rsplit("@", 1)
    masked_local = local[0] + "***" if len(local) <= 2 else local[0] + "***" + local[-1]
    return f"{masked_local}@{domain}"


async def _send_mfa_code(
    db: AsyncSession,
    user: User,
    client_ip: str | None,
) -> str:
    """Generate and send an MFA code to the user's email. Returns the raw code for verification."""
    raw_code = _generate_mfa_code()
    code_hash = hashlib.sha256(raw_code.encode()).hexdigest()
    expires_at = datetime.now(UTC) + timedelta(minutes=MFA_CODE_EXPIRY_MINUTES)

    # Send email before committing so that orphan codes are not persisted
    # if the email delivery fails.
    email_service = get_email_service()
    await email_service.areload_config()
    await email_service.send_mfa_code(
        to_email=user.email,
        code=raw_code,
        display_name=user.display_name,
    )

    mfa_code = MfaCode(
        user_id=user.id,
        code_hash=code_hash,
        expires_at=expires_at,
        ip_address=client_ip,
    )
    db.add(mfa_code)
    await db.commit()

    return raw_code


# ---------------------------------------------------------------------------
# MFA Verification Endpoints
# ---------------------------------------------------------------------------


@router.post("/mfa/verify")
async def verify_mfa(
    payload: MfaVerifyRequest,
    response: Response,
    db: AsyncSession = Depends(get_db_session),
):
    """Verify an MFA code and issue the full JWT on success."""
    user_id = _verify_mfa_token(payload.mfa_token)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired MFA session.",
        )

    # Look up user
    user = await db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive.",
        )

    # Find the latest unused MFA code for this user
    code_hash = hashlib.sha256(payload.code.encode()).hexdigest()
    now = datetime.now(UTC)
    result = await db.execute(
        select(MfaCode)
        .where(
            MfaCode.user_id == user_id,
            MfaCode.used_at.is_(None),
        )
        .order_by(MfaCode.created_at.desc())
        .with_for_update()
    )
    mfa_codes = list(result.scalars().all())

    if not mfa_codes:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No pending verification code. Please request a new one.",
        )

    # Reject if any pending code has been locked out due to too many failed attempts
    if any(mc.failed_attempts >= MFA_CODE_MAX_ATTEMPTS for mc in mfa_codes):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed verification attempts. Please request a new code.",
        )

    # Check all pending codes (user might have requested resend)
    matched_code = None
    for mc in mfa_codes:
        # Check expiry
        expires_at = mc.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=UTC)
        if now > expires_at:
            continue
        if hmac.compare_digest(mc.code_hash, code_hash):
            matched_code = mc
            break

    if not matched_code:
        # Check if the code matches an expired one (give specific error)
        for mc in mfa_codes:
            if hmac.compare_digest(mc.code_hash, code_hash):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Verification code has expired. Please request a new one.",
                )
        # Increment failed attempts on all pending codes to prevent brute-force
        for mc in mfa_codes:
            mc.failed_attempts += 1
        await db.commit()
        # Lock out if any code has exceeded max attempts
        if any(mc.failed_attempts >= MFA_CODE_MAX_ATTEMPTS for mc in mfa_codes):
            for mc in mfa_codes:
                mc.used_at = now
            await db.commit()
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many failed verification attempts. Please request a new code.",
            )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid verification code.",
        )

    # Mark code as used
    matched_code.used_at = now
    # Invalidate all other pending codes for this user
    for mc in mfa_codes:
        if mc.id != matched_code.id and mc.used_at is None:
            mc.used_at = now
    await db.commit()

    # Issue full JWT
    token, expires_at = create_access_token(user.id, subject_kind="id", role=user.role or "user")
    _set_auth_cookie(response, token)
    return TokenResponse(access_token=token, expires_at=expires_at)


@router.post("/mfa/resend")
async def resend_mfa(
    payload: MfaResendRequest,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
):
    """Resend a new MFA code to the user's email."""
    user_id = _verify_mfa_token(payload.mfa_token)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired MFA session.",
        )

    user = await db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive.",
        )

    if not user.email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User has no email address configured.",
        )

    # Rate limit resend: check if a code was created in the last 30 seconds
    cooldown_threshold = datetime.now(UTC) - timedelta(seconds=MFA_RESEND_COOLDOWN_SECONDS)
    recent_result = await db.execute(
        select(MfaCode)
        .where(
            MfaCode.user_id == user_id,
            MfaCode.created_at >= cooldown_threshold,
        )
        .order_by(MfaCode.created_at.desc())
    )
    recent_code = recent_result.scalar_one_or_none()
    if recent_code:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Please wait {MFA_RESEND_COOLDOWN_SECONDS} seconds before requesting a new code.",
        )

    # Generate and send new code
    client_ip = request.client.host if request.client else None
    try:
        await _send_mfa_code(db, user, client_ip)
    except EmailServiceError as exc:
        logger.warning("Failed to resend MFA code to %s: %s", user.email, exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Failed to send verification email. Please try again later.",
        )

    # Issue a fresh MFA token (extends the window)
    mfa_token, mfa_expires = _create_mfa_token(user.id)

    return MfaRequiredResponse(
        mfa_required=True,
        mfa_token=mfa_token,
        email_mask=_mask_email(user.email),
        expires_at=mfa_expires,
    )


@router.get("/mfa/status", response_model=MfaStatusResponse)
async def mfa_status(
    db: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_user),
) -> MfaStatusResponse:
    """Get current MFA configuration status."""
    mfa_enabled = await _is_mfa_globally_enabled(db)
    email_service = get_email_service()
    await email_service.areload_config()
    return MfaStatusResponse(
        enabled=mfa_enabled,
        email_configured=email_service.is_configured,
    )
