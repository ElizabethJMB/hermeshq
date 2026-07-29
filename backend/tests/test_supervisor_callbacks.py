"""Tests for AgentSupervisor._drain_callbacks — post-commit callback isolation."""

import unittest
from unittest.mock import AsyncMock, MagicMock

from hermeshq.services.agent_supervisor import AgentSupervisor


def _make_supervisor() -> AgentSupervisor:
    return AgentSupervisor(
        session_factory=MagicMock(),
        event_broker=MagicMock(),
        runtime=MagicMock(),
        secret_vault=MagicMock(),
    )


class TestDrainCallbacks(unittest.IsolatedAsyncioTestCase):
    async def test_runs_all_callbacks_in_order(self) -> None:
        supervisor = _make_supervisor()
        calls: list[str] = []

        async def cb_a() -> None:
            calls.append("a")

        async def cb_b() -> None:
            calls.append("b")

        await supervisor._drain_callbacks([cb_a, cb_b])
        self.assertEqual(calls, ["a", "b"])

    async def test_failing_callback_does_not_abort_rest(self) -> None:
        supervisor = _make_supervisor()
        calls: list[str] = []

        async def failing() -> None:
            raise RuntimeError("telegram is down")

        async def after() -> None:
            calls.append("after")

        await supervisor._drain_callbacks([failing, after])
        self.assertEqual(calls, ["after"])

    async def test_empty_list_is_noop(self) -> None:
        supervisor = _make_supervisor()
        await supervisor._drain_callbacks([])

    async def test_mixed_sync_exceptions_are_contained(self) -> None:
        supervisor = _make_supervisor()
        cb = AsyncMock(side_effect=ValueError("boom"))
        await supervisor._drain_callbacks([cb])
        cb.assert_awaited_once()


if __name__ == "__main__":
    unittest.main()
