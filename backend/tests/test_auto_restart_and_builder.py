"""Tests for gateway auto-restart, inline tool call parsing, and PDF plugin."""

import asyncio
import json
import unittest
from unittest.mock import AsyncMock, MagicMock, Mock, patch

from hermeshq.services.agent_builder import (
    _extract_inline_tool_calls,
    _strip_tool_call_blocks,
)
from hermeshq.services.gateway_process_manager import (
    GATEWAY_AUTO_RESTART_MAX_ATTEMPTS,
    GatewayProcessManager,
)


# ---------------------------------------------------------------------------
# Test: _strip_tool_call_blocks
# ---------------------------------------------------------------------------

class TestStripToolCallBlocks(unittest.TestCase):
    def test_strips_closed_block(self):
        text = "Hello user.<tool_call>\n<function=test>\n</function>\n</tool_call>"
        clean = _strip_tool_call_blocks(text)
        self.assertEqual(clean, "Hello user.")

    def test_strips_unclosed_block(self):
        text = "Hello<tool_call><function=test>"
        clean = _strip_tool_call_blocks(text)
        self.assertEqual(clean, "Hello")

    def test_strips_stray_tags(self):
        text = "Hello</function=foo><parameter=bar>value</parameter>"
        clean = _strip_tool_call_blocks(text)
        self.assertEqual(clean, "Hello")

    def test_preserves_clean_text(self):
        text = "This is a clean message with no tags."
        clean = _strip_tool_call_blocks(text)
        self.assertEqual(clean, "This is a clean message with no tags.")

    def test_strips_multiple_blocks(self):
        text = (
            "First message.<tool_call><function=a></function></tool_call>"
            "Second message.<tool_call><function=b></function></tool_call>"
        )
        clean = _strip_tool_call_blocks(text)
        self.assertIn("First message.", clean)
        self.assertIn("Second message.", clean)
        self.assertNotIn("<tool_call>", clean)

    def test_cleans_excessive_whitespace(self):
        text = "Hello.\n\n\n\n\n<tool_call>\n</tool_call>\n\n\n\nWorld"
        clean = _strip_tool_call_blocks(text)
        self.assertNotIn("\n\n\n", clean)


# ---------------------------------------------------------------------------
# Test: _extract_inline_tool_calls
# ---------------------------------------------------------------------------

class TestExtractInlineToolCalls(unittest.TestCase):
    def test_parses_simple_call(self):
        text = (
            "<tool_call>\n"
            "<function=propose_agent_draft>\n"
            "<parameter=friendly_name>Test Agent</parameter>\n"
            "<parameter=runtime_profile>standard</parameter>\n"
            "<parameter=ready_to_create>true</parameter>\n"
            "</function>\n"
            "</tool_call>"
        )
        calls = _extract_inline_tool_calls(text)
        self.assertEqual(len(calls), 1)
        name, params = calls[0]
        self.assertEqual(name, "propose_agent_draft")
        self.assertEqual(params["friendly_name"], "Test Agent")
        self.assertEqual(params["runtime_profile"], "standard")
        self.assertIs(params["ready_to_create"], True)

    def test_parses_json_parameter(self):
        text = (
            "<tool_call>\n"
            "<function=propose_agent_draft>\n"
            '<parameter=integration_configs>{"email": {}}</parameter>\n'
            "</function>\n"
            "</tool_call>"
        )
        calls = _extract_inline_tool_calls(text)
        self.assertEqual(len(calls), 1)
        _, params = calls[0]
        self.assertEqual(params["integration_configs"], {"email": {}})

    def test_parses_multiline_parameter(self):
        text = (
            "<tool_call>\n"
            "<function=propose_agent_draft>\n"
            "<parameter=system_prompt>\n"
            "Line 1\n"
            "Line 2\n"
            "Line 3\n"
            "</parameter>\n"
            "</function>\n"
            "</tool_call>"
        )
        calls = _extract_inline_tool_calls(text)
        self.assertEqual(len(calls), 1)
        _, params = calls[0]
        self.assertIn("Line 1", params["system_prompt"])
        self.assertIn("Line 3", params["system_prompt"])

    def test_returns_empty_for_no_calls(self):
        text = "Just a regular message."
        calls = _extract_inline_tool_calls(text)
        self.assertEqual(calls, [])

    def test_parses_multiple_calls(self):
        text = (
            "<tool_call><function=list_capabilities></function></tool_call>"
            "<tool_call><function=propose_agent_draft>"
            "<parameter=friendly_name>Bot</parameter>"
            "</function></tool_call>"
        )
        calls = _extract_inline_tool_calls(text)
        self.assertEqual(len(calls), 2)
        self.assertEqual(calls[0][0], "list_capabilities")
        self.assertEqual(calls[1][0], "propose_agent_draft")

    def test_parses_user_output_exact_format(self):
        """Test with the EXACT format from the user's bug report."""
        text = (
            "Perfecto, voy a crear un Asistente.<tool_call>\n\n"
            "<function=propose_agent_draft>\n\n"
            "<parameter=friendly_name>\nAsistente de Correo\n</parameter>\n\n"
            "<parameter=system_prompt>\nEres un asistente.\n</parameter>\n\n"
            "<parameter=runtime_profile>\nstandard\n</parameter>\n\n"
            "<parameter=ready_to_create>\ntrue\n</parameter>\n\n"
            "</function>\n\n</tool_call>"
        )
        calls = _extract_inline_tool_calls(text)
        self.assertEqual(len(calls), 1)
        name, params = calls[0]
        self.assertEqual(name, "propose_agent_draft")
        self.assertEqual(params["friendly_name"], "Asistente de Correo")
        self.assertIs(params["ready_to_create"], True)

        clean = _strip_tool_call_blocks(text)
        self.assertEqual(clean, "Perfecto, voy a crear un Asistente.")


# ---------------------------------------------------------------------------
# Test: Gateway auto-restart
# ---------------------------------------------------------------------------

def _make_process_manager():
    """Create a GatewayProcessManager with mocked dependencies."""
    session_factory = MagicMock()
    event_broker = Mock()
    event_broker.publish = AsyncMock()
    installation_manager = MagicMock()
    installation_manager.sync_agent_installation = AsyncMock()
    mgr = GatewayProcessManager(
        session_factory=session_factory,
        event_broker=event_broker,
        installation_manager=installation_manager,
        processes={},
    )
    return mgr, session_factory, event_broker, installation_manager


def _make_agent_mock(agent_id="agent-1", is_archived=False):
    agent = Mock()
    agent.id = agent_id
    agent.is_archived = is_archived
    agent.node_id = "node-1"
    agent.name = "TestAgent"
    agent.workspace_path = "/tmp/ws"
    return agent


def _make_channel_mock(platform="sixagentic", enabled=True, runtime_disabled=False):
    ch = Mock()
    ch.platform = platform
    ch.enabled = enabled
    ch.status = "running"
    ch.last_error = None
    ch.metadata_json = {"runtime_disabled": True} if runtime_disabled else {}
    return ch


class TestAutoRestartDecision(unittest.IsolatedAsyncioTestCase):
    """Test that _auto_restart_gateway decides correctly whether to restart."""

    async def test_no_restart_when_channel_explicitly_stopped(self):
        """If user stopped the channel (runtime_disabled=True), don't restart."""
        mgr, sf, eb, im = _make_process_manager()
        agent = _make_agent_mock()

        # Channels with runtime_disabled=True — user explicitly stopped
        channels = [_make_channel_mock(runtime_disabled=True)]

        # Mock session sequence: multiple session opens
        sessions = []
        for _ in range(10):
            s = MagicMock()
            s.__aenter__ = AsyncMock(return_value=s)
            s.__aexit__ = AsyncMock(return_value=False)
            s.commit = AsyncMock()
            s.get = AsyncMock(return_value=agent)
            result = Mock()
            scalars = Mock()
            scalars.all = Mock(return_value=channels)
            result.scalars = Mock(return_value=scalars)
            s.execute = AsyncMock(return_value=result)
            sessions.append(s)

        sf.side_effect = lambda: sessions.pop(0) if sessions else sessions[-1]

        await mgr._auto_restart_gateway("agent-1", {"sixagentic"}, uptime=100.0, log_mgr=None)

        # Should NOT have attempted to sync or launch
        im.sync_agent_installation.assert_not_called()
        mgr._reload_agent = AsyncMock()
        mgr._reload_agent.assert_not_called()

    async def test_no_restart_when_agent_archived(self):
        """If agent is archived, don't restart."""
        mgr, sf, eb, im = _make_process_manager()
        agent = _make_agent_mock(is_archived=True)

        sessions = []
        for _ in range(5):
            s = MagicMock()
            s.__aenter__ = AsyncMock(return_value=s)
            s.__aexit__ = AsyncMock(return_value=False)
            s.commit = AsyncMock()
            s.get = AsyncMock(return_value=agent)
            result = Mock()
            scalars = Mock()
            scalars.all = Mock(return_value=[])
            result.scalars = Mock(return_value=scalars)
            s.execute = AsyncMock(return_value=result)
            sessions.append(s)

        sf.side_effect = lambda: sessions.pop(0) if sessions else sessions[-1]

        await mgr._auto_restart_gateway("agent-1", {"sixagentic"}, uptime=100.0, log_mgr=None)
        im.sync_agent_installation.assert_not_called()

    async def test_no_restart_when_already_running(self):
        """If gateway was already relaunched, don't restart again."""
        mgr, sf, eb, im = _make_process_manager()
        agent = _make_agent_mock()
        channels = [_make_channel_mock(enabled=True)]

        sessions = []
        for _ in range(10):
            s = MagicMock()
            s.__aenter__ = AsyncMock(return_value=s)
            s.__aexit__ = AsyncMock(return_value=False)
            s.commit = AsyncMock()
            s.get = AsyncMock(return_value=agent)
            result = Mock()
            scalars = Mock()
            scalars.all = Mock(return_value=channels)
            result.scalars = Mock(return_value=scalars)
            s.execute = AsyncMock(return_value=result)
            sessions.append(s)

        sf.side_effect = lambda: sessions.pop(0) if sessions else sessions[-1]

        # Simulate gateway already running
        mgr.processes["agent-1"] = Mock()

        await mgr._auto_restart_gateway("agent-1", {"sixagentic"}, uptime=100.0, log_mgr=None)
        im.sync_agent_installation.assert_not_called()

    async def test_restart_attempts_launch_when_channel_enabled(self):
        """If channel is enabled and not runtime_disabled, should attempt restart."""
        mgr, sf, eb, im = _make_process_manager()
        agent = _make_agent_mock()
        channels = [_make_channel_mock(enabled=True, runtime_disabled=False)]

        sessions = []
        for _ in range(20):
            s = MagicMock()
            s.__aenter__ = AsyncMock(return_value=s)
            s.__aexit__ = AsyncMock(return_value=False)
            s.commit = AsyncMock()
            s.get = AsyncMock(return_value=agent)
            result = Mock()
            scalars = Mock()
            scalars.all = Mock(return_value=channels)
            result.scalars = Mock(return_value=scalars)
            s.execute = AsyncMock(return_value=result)
            sessions.append(s)

        sf.side_effect = lambda: sessions.pop(0) if sessions else sessions[-1]

        # Mock _reload_agent and _launch_gateway_process
        mgr._reload_agent = AsyncMock(return_value=agent)

        mock_handle = Mock()
        mock_handle.platforms = {"sixagentic"}
        mock_handle.process = Mock()
        mock_handle.process.pid = 12345
        mgr._launch_gateway_process = AsyncMock(return_value=mock_handle)

        # Speed up: no sleep
        with patch("asyncio.sleep", new=AsyncMock()):
            await mgr._auto_restart_gateway("agent-1", {"sixagentic"}, uptime=100.0, log_mgr=None)

        im.sync_agent_installation.assert_called_once()
        mgr._launch_gateway_process.assert_called_once()

    async def test_gives_up_after_max_attempts(self):
        """After max attempts, marks channel as error."""
        mgr, sf, eb, im = _make_process_manager()
        agent = _make_agent_mock()
        channels = [_make_channel_mock(enabled=True)]

        sessions = []
        for _ in range(40):
            s = MagicMock()
            s.__aenter__ = AsyncMock(return_value=s)
            s.__aexit__ = AsyncMock(return_value=False)
            s.commit = AsyncMock()
            s.get = AsyncMock(return_value=agent)
            result = Mock()
            scalars = Mock()
            scalars.all = Mock(return_value=channels)
            result.scalars = Mock(return_value=scalars)
            s.execute = AsyncMock(return_value=result)
            sessions.append(s)

        sf.side_effect = lambda: sessions.pop(0) if sessions else sessions[-1]

        mgr._reload_agent = AsyncMock(return_value=agent)
        mgr._launch_gateway_process = AsyncMock(side_effect=RuntimeError("boom"))

        with patch("asyncio.sleep", new=AsyncMock()):
            await mgr._auto_restart_gateway("agent-1", {"sixagentic"}, uptime=5.0, log_mgr=None)

        # Should have tried exactly MAX_ATTEMPTS times
        self.assertEqual(mgr._launch_gateway_process.call_count, GATEWAY_AUTO_RESTART_MAX_ATTEMPTS)

        # Last session should have status=error
        last_session = sessions[-1] if sessions else None


# ---------------------------------------------------------------------------
# Test: PDF plugin
# ---------------------------------------------------------------------------

class TestPdfPlugin(unittest.TestCase):
    def test_plugin_yaml_exists(self):
        from pathlib import Path
        from hermeshq.services.managed_capabilities import plugin_templates_root
        plugin_dir = plugin_templates_root() / "hermeshq_pdf"
        self.assertTrue(plugin_dir.is_dir(), f"Plugin dir not found: {plugin_dir}")
        yaml_file = plugin_dir / "plugin.yaml"
        self.assertTrue(yaml_file.is_file(), f"plugin.yaml not found")
        init_file = plugin_dir / "__init__.py"
        self.assertTrue(init_file.is_file(), f"__init__.py not found")

    def test_plugin_in_core_catalog(self):
        from hermeshq.services.managed_capabilities import CORE_MANAGED_PLUGIN_CATALOG
        slugs = [p["slug"] for p in CORE_MANAGED_PLUGIN_CATALOG]
        self.assertIn("hermeshq_pdf", slugs)

    def test_pdf_in_standard_profile(self):
        from hermeshq.services.runtime_profiles import STANDARD_ENABLED_TOOLSETS
        self.assertIn("hermeshq_pdf", STANDARD_ENABLED_TOOLSETS)

    def test_register_callable(self):
        """Test that register() exists and accepts a ctx-like object."""
        from hermeshq.plugin_templates.hermeshq_pdf import register
        ctx = Mock()
        ctx.register_tool = Mock()
        register(ctx)
        self.assertTrue(ctx.register_tool.called)
        call_args = ctx.register_tool.call_args
        self.assertEqual(call_args.kwargs["toolset"], "hermeshq_pdf")

    def test_generate_pdf_handler_returns_json(self):
        """Test that the PDF handler returns valid JSON without weasyprint."""
        from hermeshq.plugin_templates.hermeshq_pdf import _handle_generate_pdf
        result = _handle_generate_pdf({"title": "Test", "html_content": "<p>Hello</p>"})
        data = json.loads(result)
        # weasyprint not installed in test env — should return success=False
        self.assertFalse(data["success"])
        self.assertIn("error", data)


if __name__ == "__main__":
    unittest.main()
