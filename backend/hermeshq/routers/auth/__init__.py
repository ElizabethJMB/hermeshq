"""Auth router package — aggregates local, MFA and OIDC sub-routers.

The parent router owns the ``/auth`` prefix and ``auth`` tag; sub-modules
define their own prefix-less routers which are included below.
"""

from fastapi import APIRouter

from . import local, mfa, oidc

router = APIRouter(prefix="/auth", tags=["auth"])
router.include_router(local.router)
router.include_router(mfa.router)
router.include_router(oidc.router)

__all__ = ["router"]
