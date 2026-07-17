"""Unit tests for hermeshq.services.audit.redact_sensitive."""

import unittest

from hermeshq.services.audit import redact_sensitive


class TestRedactSensitive(unittest.TestCase):
    def test_redacts_credential_keys(self) -> None:
        payload = {
            "resend_api_key": "re_123456789",
            "from_email": "ops@example.com",
            "nested": {"telegram_bot_token": "123:abc", "enabled": True},
        }
        result = redact_sensitive(payload)
        self.assertEqual(result["resend_api_key"], "••••••")
        self.assertEqual(result["from_email"], "ops@example.com")
        self.assertEqual(result["nested"]["telegram_bot_token"], "••••••")
        self.assertTrue(result["nested"]["enabled"])

    def test_redacts_inside_lists(self) -> None:
        payload = {"items": [{"api_key": "sk-x"}, {"name": "ok"}]}
        result = redact_sensitive(payload)
        self.assertEqual(result["items"][0]["api_key"], "••••••")
        self.assertEqual(result["items"][1]["name"], "ok")

    def test_falsy_values_kept(self) -> None:
        result = redact_sensitive({"api_key": None, "password": ""})
        self.assertIsNone(result["api_key"])
        self.assertEqual(result["password"], "")

    def test_does_not_mutate_input(self) -> None:
        payload = {"api_key": "sk-x"}
        redact_sensitive(payload)
        self.assertEqual(payload["api_key"], "sk-x")

    def test_scalars_passthrough(self) -> None:
        self.assertEqual(redact_sensitive("text"), "text")
        self.assertEqual(redact_sensitive(42), 42)
        self.assertIsNone(redact_sensitive(None))


if __name__ == "__main__":
    unittest.main()
