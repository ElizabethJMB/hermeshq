"""Unit tests for hermeshq.services.auxiliary_models."""

import unittest

from hermeshq.schemas.agent import AuxiliaryModelEntry
from hermeshq.services.auxiliary_models import (
    API_KEY_ENC_FIELD,
    encrypt_auxiliary_models,
    migrate_auxiliary_models,
    resolve_auxiliary_api_key,
    sanitize_auxiliary_models,
)
from hermeshq.services.secret_vault import SecretVault

VAULT = SecretVault(seed="test-seed")


class TestEncryptAuxiliaryModels(unittest.TestCase):
    def test_plaintext_key_is_encrypted(self) -> None:
        result = encrypt_auxiliary_models(
            {"vision": AuxiliaryModelEntry(provider="openai", model="gpt-4o", api_key="sk-secret-123")},
            VAULT,
        )
        assert result is not None
        entry = result["vision"]
        self.assertNotIn("api_key", entry)
        self.assertIn(API_KEY_ENC_FIELD, entry)
        self.assertNotIn("sk-secret-123", entry[API_KEY_ENC_FIELD])
        self.assertEqual(resolve_auxiliary_api_key(VAULT, entry), "sk-secret-123")

    def test_no_key_produces_no_enc_field(self) -> None:
        result = encrypt_auxiliary_models(
            {"vision": AuxiliaryModelEntry(provider="openai", model="gpt-4o")},
            VAULT,
        )
        assert result is not None
        self.assertNotIn(API_KEY_ENC_FIELD, result["vision"])
        self.assertNotIn("api_key", result["vision"])

    def test_none_input_returns_none(self) -> None:
        self.assertIsNone(encrypt_auxiliary_models(None, VAULT))

    def test_update_without_api_key_preserves_stored_key(self) -> None:
        existing = {
            "vision": {
                API_KEY_ENC_FIELD: encrypt_auxiliary_models(
                    {"vision": AuxiliaryModelEntry(api_key="sk-old")},
                    VAULT,
                )["vision"][API_KEY_ENC_FIELD]
            }
        }
        result = encrypt_auxiliary_models(
            {"vision": {"provider": "openai", "model": "gpt-4o-mini"}},
            VAULT,
            existing=existing,
        )
        assert result is not None
        self.assertEqual(resolve_auxiliary_api_key(VAULT, result["vision"]), "sk-old")

    def test_update_with_empty_api_key_clears_stored_key(self) -> None:
        existing_result = encrypt_auxiliary_models(
            {"vision": AuxiliaryModelEntry(api_key="sk-old")},
            VAULT,
        )
        result = encrypt_auxiliary_models(
            {"vision": {"provider": "openai", "api_key": ""}},
            VAULT,
            existing=existing_result,
        )
        assert result is not None
        self.assertIsNone(resolve_auxiliary_api_key(VAULT, result["vision"]))

    def test_update_with_new_key_replaces_stored_key(self) -> None:
        existing_result = encrypt_auxiliary_models(
            {"vision": AuxiliaryModelEntry(api_key="sk-old")},
            VAULT,
        )
        result = encrypt_auxiliary_models(
            {"vision": {"api_key": "sk-new"}},
            VAULT,
            existing=existing_result,
        )
        assert result is not None
        self.assertEqual(resolve_auxiliary_api_key(VAULT, result["vision"]), "sk-new")

    def test_explicit_new_ref_drops_stored_plaintext_key(self) -> None:
        existing_result = encrypt_auxiliary_models(
            {"vision": AuxiliaryModelEntry(api_key="sk-old")},
            VAULT,
        )
        result = encrypt_auxiliary_models(
            {"vision": {"api_key_ref": "my-secret"}},
            VAULT,
            existing=existing_result,
        )
        assert result is not None
        self.assertNotIn(API_KEY_ENC_FIELD, result["vision"])
        self.assertEqual(result["vision"]["api_key_ref"], "my-secret")


class TestSanitizeAuxiliaryModels(unittest.TestCase):
    def test_strips_credentials_and_marks_presence(self) -> None:
        raw = {
            "vision": {
                "provider": "openai",
                "model": "gpt-4o",
                "api_key_ref": "my-ref",
                API_KEY_ENC_FIELD: "enc:v1:abcdef",
            },
            "compression": {"provider": "gemini", "api_key": "sk-legacy-plain"},
        }
        sanitized = sanitize_auxiliary_models(raw)
        assert sanitized is not None
        vision = sanitized["vision"]
        self.assertNotIn(API_KEY_ENC_FIELD, vision)
        self.assertNotIn("api_key", vision)
        self.assertTrue(vision["has_api_key"])
        self.assertEqual(vision["api_key_ref"], "my-ref")
        compression = sanitized["compression"]
        self.assertNotIn("api_key", compression)
        self.assertTrue(compression["has_api_key"])

    def test_no_key_means_has_api_key_false(self) -> None:
        sanitized = sanitize_auxiliary_models({"vision": {"provider": "openai"}})
        assert sanitized is not None
        self.assertFalse(sanitized["vision"]["has_api_key"])

    def test_none_and_empty(self) -> None:
        self.assertIsNone(sanitize_auxiliary_models(None))
        self.assertIsNone(sanitize_auxiliary_models({}))


class TestMigrateAuxiliaryModels(unittest.TestCase):
    def test_migrates_plaintext_to_enc(self) -> None:
        raw = {"vision": {"provider": "openai", "api_key": "sk-plain"}}
        migrated, changed = migrate_auxiliary_models(raw, VAULT)
        self.assertTrue(changed)
        self.assertNotIn("api_key", migrated["vision"])
        self.assertEqual(resolve_auxiliary_api_key(VAULT, migrated["vision"]), "sk-plain")

    def test_already_encrypted_unchanged(self) -> None:
        encrypted = encrypt_auxiliary_models({"vision": AuxiliaryModelEntry(api_key="sk-x")}, VAULT)
        migrated, changed = migrate_auxiliary_models(encrypted, VAULT)
        self.assertFalse(changed)
        self.assertEqual(migrated, encrypted)

    def test_none_input(self) -> None:
        migrated, changed = migrate_auxiliary_models(None, VAULT)
        self.assertFalse(changed)
        self.assertIsNone(migrated)


class TestResolveAuxiliaryApiKey(unittest.TestCase):
    def test_legacy_plaintext_still_resolves(self) -> None:
        self.assertEqual(resolve_auxiliary_api_key(VAULT, {"api_key": "sk-plain"}), "sk-plain")

    def test_corrupt_enc_returns_none(self) -> None:
        self.assertIsNone(resolve_auxiliary_api_key(VAULT, {API_KEY_ENC_FIELD: "enc:v1:not-valid-ciphertext"}))

    def test_no_key_returns_none(self) -> None:
        self.assertIsNone(resolve_auxiliary_api_key(VAULT, {"provider": "openai"}))


if __name__ == "__main__":
    unittest.main()
