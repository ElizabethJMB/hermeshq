import os

_SENSITIVE_ENV_PREFIXES = (
    "AWS_",
    "GOOGLE_APPLICATION_CREDENTIALS",
    "GOOGLE_CREDENTIALS",
    "KUBECONFIG",
    "DOCKER_",
    "GITHUB_TOKEN",
    "GITLAB_TOKEN",
    "HEROKU_API_KEY",
    "STRIPE_",
    "TWILIO_",
    "SENDGRID_",
    "DATABASE_URL",
    "REDIS_URL",
    "RABBITMQ_",
    "KAFKA_",
    "LDAP_",
    "VAULT_TOKEN",
    "VAULT_ADDR",
    "HERMESHQ_",
)


def build_safe_env() -> dict[str, str]:
    """Build a sanitized copy of os.environ with sensitive keys removed."""
    safe: dict[str, str] = {}
    for key, value in os.environ.items():
        if any(key.upper().startswith(prefix) for prefix in _SENSITIVE_ENV_PREFIXES):
            continue
        safe[key] = value
    return safe
