"""CORS middleware scoped to public chat widget endpoints.

The global CORSMiddleware restricts origins to the admin frontend.
Public chat widget requests come from arbitrary customer domains, so
they need a permissive CORS policy.  Origin validation is handled at
the application layer by the API-key allowed_domains check.
"""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

_PUBLIC_CHAT_PREFIX = "/api/public/chat/"

_ALLOW_HEADERS = "Content-Type, X-Api-Key, X-Session-Token"
_ALLOW_METHODS = "GET, POST, OPTIONS"
_MAX_AGE = "600"


class PublicChatCORSMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if not request.url.path.startswith(_PUBLIC_CHAT_PREFIX):
            return await call_next(request)

        origin = request.headers.get("origin", "")

        if request.method == "OPTIONS":
            return Response(
                status_code=204,
                headers={
                    "Access-Control-Allow-Origin": origin or "*",
                    "Access-Control-Allow-Methods": _ALLOW_METHODS,
                    "Access-Control-Allow-Headers": _ALLOW_HEADERS,
                    "Access-Control-Max-Age": _MAX_AGE,
                },
            )

        response = await call_next(request)
        response.headers["Access-Control-Allow-Origin"] = origin or "*"
        response.headers["Access-Control-Allow-Headers"] = _ALLOW_HEADERS
        response.headers["Access-Control-Expose-Headers"] = "Content-Type"
        return response
