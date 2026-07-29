"""Unit tests for hermeshq.services.secret_vault.SecretVault."""

import unittest

from cryptography.fernet import InvalidToken

from hermeshq.services.secret_vault import SecretVault


class TestSecretVaultRoundTrip(unittest.TestCase):
    """Encrypt/decrypt round-trip tests."""

    def test_simple_string(self) -> None:
        """Simple string encrypts and decrypts to the same value."""
        vault = SecretVault(seed="test-seed")
        original = "hello world"
        encrypted = vault.encrypt(original)
        decrypted = vault.decrypt(encrypted)
        self.assertEqual(decrypted, original)

    def test_empty_string(self) -> None:
        """Empty string works correctly."""
        vault = SecretVault(seed="test-seed")
        original = ""
        encrypted = vault.encrypt(original)
        decrypted = vault.decrypt(encrypted)
        self.assertEqual(decrypted, original)

    def test_long_string(self) -> None:
        """Long string (10000 chars) works correctly."""
        vault = SecretVault(seed="test-seed")
        original = "a" * 10_000
        encrypted = vault.encrypt(original)
        decrypted = vault.decrypt(encrypted)
        self.assertEqual(decrypted, original)

    def test_unicode_characters(self) -> None:
        """Unicode characters (emoji, accented, etc.) work correctly."""
        vault = SecretVault(seed="test-seed")
        original = "Héllo wörld 🚀 ñoño 日本語 ♥"
        encrypted = vault.encrypt(original)
        decrypted = vault.decrypt(encrypted)
        self.assertEqual(decrypted, original)

    def test_special_characters(self) -> None:
        """Special characters (newlines, tabs, quotes) work correctly."""
        vault = SecretVault(seed="test-seed")
        original = "line1\nline2\ttabbed\"quoted\"'single'\r\n"
        encrypted = vault.encrypt(original)
        decrypted = vault.decrypt(encrypted)
        self.assertEqual(decrypted, original)


class TestSecretVaultDeterminism(unittest.TestCase):
    """Determinism tests for SecretVault."""

    def test_same_seed_same_behavior(self) -> None:
        """Same seed produces same vault behavior: both values decrypt correctly."""
        vault_a = SecretVault(seed="shared-seed")
        vault_b = SecretVault(seed="shared-seed")
        encrypted_a = vault_a.encrypt("value-a")
        encrypted_b = vault_b.encrypt("value-b")
        self.assertEqual(vault_a.decrypt(encrypted_a), "value-a")
        self.assertEqual(vault_b.decrypt(encrypted_b), "value-b")
        # Cross-decryption also works because same seed → same key
        self.assertEqual(vault_b.decrypt(encrypted_a), "value-a")
        self.assertEqual(vault_a.decrypt(encrypted_b), "value-b")

    def test_different_seeds_different_ciphertext(self) -> None:
        """Different seeds produce different ciphertexts for the same plaintext."""
        vault_a = SecretVault(seed="seed-alpha")
        vault_b = SecretVault(seed="seed-beta")
        plaintext = "same-plaintext"
        encrypted_a = vault_a.encrypt(plaintext)
        encrypted_b = vault_b.encrypt(plaintext)
        self.assertNotEqual(encrypted_a, encrypted_b)


class TestSecretVaultProperties(unittest.TestCase):
    """Property-based tests for ciphertext characteristics."""

    def test_ciphertext_is_bytes(self) -> None:
        """Ciphertext is bytes, not str."""
        vault = SecretVault(seed="test-seed")
        encrypted = vault.encrypt("hello")
        self.assertIsInstance(encrypted, bytes)

    def test_ciphertext_differs_each_call(self) -> None:
        """Ciphertext is different each call (Fernet uses random IV)."""
        vault = SecretVault(seed="test-seed")
        encrypted_a = vault.encrypt("same-input")
        encrypted_b = vault.encrypt("same-input")
        self.assertNotEqual(encrypted_a, encrypted_b)

    def test_ciphertext_longer_than_plaintext(self) -> None:
        """Ciphertext length > plaintext length (due to IV + padding)."""
        vault = SecretVault(seed="test-seed")
        plaintext = "hello"
        encrypted = vault.encrypt(plaintext)
        self.assertGreater(len(encrypted), len(plaintext))


class TestSecretVaultErrorHandling(unittest.TestCase):
    """Error handling tests."""

    def test_decrypt_garbage_raises_invalid_token(self) -> None:
        """Decrypting garbage bytes raises InvalidToken."""
        vault = SecretVault(seed="test-seed")
        with self.assertRaises(InvalidToken):
            vault.decrypt(b"this-is-not-valid-ciphertext-at-all!!")

    def test_decrypt_wrong_seed_raises_invalid_token(self) -> None:
        """Decrypting with a different seed vault raises InvalidToken."""
        vault_a = SecretVault(seed="seed-alpha")
        vault_b = SecretVault(seed="seed-beta")
        encrypted = vault_a.encrypt("secret")
        with self.assertRaises(InvalidToken):
            vault_b.decrypt(encrypted)


class TestSecretVaultLegacySeeds(unittest.TestCase):
    """Legacy seed fallback for key rotation."""

    def test_decrypts_ciphertext_from_legacy_seed(self) -> None:
        old_vault = SecretVault(seed="old-seed")
        encrypted = old_vault.encrypt("stored-secret")
        new_vault = SecretVault(seed="new-seed", legacy_seeds=["old-seed"])
        self.assertEqual(new_vault.decrypt(encrypted), "stored-secret")

    def test_new_encryption_uses_primary_seed(self) -> None:
        new_vault = SecretVault(seed="new-seed", legacy_seeds=["old-seed"])
        encrypted = new_vault.encrypt("value")
        self.assertEqual(SecretVault(seed="new-seed").decrypt(encrypted), "value")
        with self.assertRaises(InvalidToken):
            SecretVault(seed="old-seed").decrypt(encrypted)

    def test_raises_when_no_seed_matches(self) -> None:
        old_vault = SecretVault(seed="unrelated-seed")
        encrypted = old_vault.encrypt("x")
        new_vault = SecretVault(seed="new-seed", legacy_seeds=["old-seed"])
        with self.assertRaises(InvalidToken):
            new_vault.decrypt(encrypted)


class TestValueHelpers(unittest.TestCase):
    """encrypt_value/decrypt_value prefixed-marker helpers."""

    def test_round_trip(self) -> None:
        from hermeshq.services.secret_vault import decrypt_value, encrypt_value, is_encrypted_value

        vault = SecretVault(seed="test-seed")
        stored = encrypt_value(vault, "my-api-key")
        self.assertTrue(is_encrypted_value(stored))
        self.assertNotIn("my-api-key", stored)
        self.assertEqual(decrypt_value(vault, stored), "my-api-key")

    def test_legacy_plaintext_passthrough(self) -> None:
        from hermeshq.services.secret_vault import decrypt_value, is_encrypted_value

        vault = SecretVault(seed="test-seed")
        self.assertFalse(is_encrypted_value("plain-value"))
        self.assertEqual(decrypt_value(vault, "plain-value"), "plain-value")

    def test_corrupt_returns_none(self) -> None:
        from hermeshq.services.secret_vault import decrypt_value

        vault = SecretVault(seed="test-seed")
        self.assertIsNone(decrypt_value(vault, "enc:v1:garbage"))


if __name__ == "__main__":
    unittest.main()
