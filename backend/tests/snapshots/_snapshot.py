"""Golden snapshots normalizados.

Los valores volátiles (tokens, UUIDs, fechas) se reemplazan por placeholders
para que el snapshot capture la FORMA del contrato, no valores de una corrida.
Regenerar con: UPDATE_SNAPSHOTS=1 python -m pytest tests/snapshots/
"""

import json
import os
import re
from pathlib import Path
from typing import Any

_GOLDENS_DIR = Path(__file__).parent / "goldens"

_UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)
_JWT_RE = re.compile(r"^eyJ[\w-]+\.[\w-]+\.[\w-]+$")
_ISO_DATETIME_RE = re.compile(r"^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}")
_COOKIE_TOKEN_RE = re.compile(r"(hermeshq_token=)[^;]+")


def _normalize_value(value: Any) -> Any:
    if isinstance(value, str):
        if _JWT_RE.match(value):
            return "<jwt>"
        if _UUID_RE.match(value):
            return "<uuid>"
        if _ISO_DATETIME_RE.match(value):
            return "<datetime>"
        return value
    if isinstance(value, dict):
        return {key: _normalize_value(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_normalize_value(item) for item in value]
    return value


def normalize_set_cookie(header: str | None) -> str | None:
    if header is None:
        return None
    return _COOKIE_TOKEN_RE.sub(r"\1<jwt>", header)


def snapshot_of(response, *, include_cookie: bool = False) -> dict:
    data: dict[str, Any] = {
        "status": response.status_code,
        "body": _normalize_value(response.json()) if response.content else None,
    }
    if include_cookie:
        data["set_cookie"] = normalize_set_cookie(response.headers.get("set-cookie"))
    return data


def assert_matches_golden(name: str, data: dict) -> None:
    golden_path = _GOLDENS_DIR / f"{name}.json"

    if os.environ.get("UPDATE_SNAPSHOTS") == "1":
        _GOLDENS_DIR.mkdir(exist_ok=True)
        golden_path.write_text(json.dumps(data, indent=2, ensure_ascii=False, sort_keys=True) + "\n")
        return

    assert golden_path.exists(), (
        f"No existe el golden '{name}'. Generarlo con UPDATE_SNAPSHOTS=1 y revisar el diff."
    )
    expected = json.loads(golden_path.read_text())
    assert data == expected, (
        f"El comportamiento observado difiere del golden '{name}'.\n"
        f"Esperado: {json.dumps(expected, indent=2, ensure_ascii=False)}\n"
        f"Obtenido: {json.dumps(data, indent=2, ensure_ascii=False)}\n"
        "Si el cambio es intencional: UPDATE_SNAPSHOTS=1 y documentar en el PR."
    )
