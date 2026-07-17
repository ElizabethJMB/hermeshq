import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken


class SecretVault:
    """Encrypts/decrypts secrets at rest using a Fernet key derived from a seed.

    ``legacy_seeds`` allows decrypting ciphertexts produced with previous
    seeds (e.g. when the vault seed was the JWT secret before FERNET_KEY was
    configured). New encryptions always use the primary seed.
    """

    def __init__(self, seed: str, *, legacy_seeds: list[str] | None = None) -> None:
        self._fernet = Fernet(self._derive_key(seed))
        self._legacy_fernets = [Fernet(self._derive_key(s)) for s in (legacy_seeds or []) if s]

    @staticmethod
    def _derive_key(seed: str) -> bytes:
        digest = hashlib.sha256(seed.encode("utf-8")).digest()
        return base64.urlsafe_b64encode(digest)

    def encrypt(self, value: str) -> bytes:
        return self._fernet.encrypt(value.encode("utf-8"))

    def decrypt(self, value_enc: bytes) -> str:
        try:
            return self._fernet.decrypt(value_enc).decode("utf-8")
        except InvalidToken:
            for legacy in self._legacy_fernets:
                try:
                    return legacy.decrypt(value_enc).decode("utf-8")
                except InvalidToken:
                    continue
            raise


ENC_PREFIX = "enc:v1:"


def encrypt_value(vault: SecretVault, plaintext: str) -> str:
    """Encrypt a string for storage in a plaintext-typed column (prefixed marker)."""
    return ENC_PREFIX + vault.encrypt(plaintext).decode("utf-8")


def decrypt_value(vault: SecretVault, stored: str) -> str | None:
    """Decrypt a value stored with :func:`encrypt_value`.

    Non-prefixed values are returned as-is (legacy plaintext). Returns None
    when a prefixed value cannot be decrypted (wrong/corrupt key).
    """
    if not stored.startswith(ENC_PREFIX):
        return stored
    try:
        return vault.decrypt(stored[len(ENC_PREFIX) :].encode("utf-8"))
    except InvalidToken:
        return None


def is_encrypted_value(stored: str) -> bool:
    return stored.startswith(ENC_PREFIX)


def build_vault_from_settings(settings) -> SecretVault:
    """Build the app SecretVault from Settings (FERNET_KEY preferred, JWT legacy fallback)."""
    seed = settings.fernet_key or settings.jwt_secret
    legacy = [settings.jwt_secret] if settings.fernet_key and settings.fernet_key != settings.jwt_secret else []
    return SecretVault(seed, legacy_seeds=legacy)
