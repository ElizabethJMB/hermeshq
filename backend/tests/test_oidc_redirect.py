"""Tests for the OIDC frontend redirect — the JWT must never appear in the URL."""

import unittest
from unittest.mock import MagicMock

from hermeshq.routers.auth.helpers import _build_frontend_redirect


def _make_request(host: str = "app.example.com", scheme: str = "https") -> MagicMock:
    request = MagicMock()
    request.headers = {"host": host}
    request.url.scheme = scheme
    request.url.netloc = host
    return request


class TestBuildFrontendRedirect(unittest.TestCase):
    def test_oidc_complete_redirect_has_no_token(self) -> None:
        url = _build_frontend_redirect(_make_request(), oidc_complete=True)
        self.assertIn("oidc=complete", url)
        self.assertNotIn("token=", url)

    def test_auth_error_redirect(self) -> None:
        url = _build_frontend_redirect(_make_request(), auth_error="boom")
        self.assertIn("auth_error=boom", url)
        self.assertNotIn("token=", url)

    def test_plain_redirect(self) -> None:
        url = _build_frontend_redirect(_make_request())
        self.assertEqual(url, "https://app.example.com/")


if __name__ == "__main__":
    unittest.main()
