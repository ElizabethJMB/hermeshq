import time

_INSTALL_CACHE: dict[str, tuple[float, list[dict]]] = {}
_INSTALL_CACHE_TTL = 60


def _get_install_cached(agent_id: str) -> list[dict] | None:
    entry = _INSTALL_CACHE.get(agent_id)
    if entry and (time.monotonic() - entry[0]) < _INSTALL_CACHE_TTL:
        return entry[1]
    return None


def _set_install_cached(agent_id: str, result: list[dict]) -> None:
    _INSTALL_CACHE[agent_id] = (time.monotonic(), result)


def _invalidate_install_cached(agent_id: str) -> None:
    _INSTALL_CACHE.pop(agent_id, None)
