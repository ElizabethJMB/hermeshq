"""AI Agent Builder service.

Conversational orchestrator that uses an LLM with tool-calling to help
users create agents. Includes deterministic connector gating.
"""

import json
import logging
import time
import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from hermeshq.models.app_settings import AppSettings
from hermeshq.schemas.agent_builder import (
    AgentDraft,
    AgentBuilderTurn,
    RequiredConnector,
)
from hermeshq.services.managed_capabilities import list_available_integration_packages

logger = logging.getLogger(__name__)

BUILDER_SYSTEM_PROMPT = """You are HermesHQ's AI Agent Builder assistant. You help users create AI agents by understanding their needs and proposing agent configurations.

Your job:
1. Understand what the user wants the agent to do.
2. Ask clarifying questions if needed (what platforms, what tools, what integrations).
3. Propose a complete agent draft including: name, friendly_name, description, system_prompt, runtime_profile, and which integration_configs are needed.
4. Use the list_capabilities tool to discover available connectors.
5. Use list_runtime_profiles to pick the right profile.
6. Once the draft is complete and the user confirms, use propose_agent_draft with the final fields and set ready_to_create=true.

Be concise and friendly. Respond in the user's language (default Spanish).

Available runtime profiles:
- standard: General-purpose agent with safe tools, browser, file, memory, vision, messaging.
- technical: Adds code execution, git, and terminal access.
- security: Adds security scanning and network tools.

When proposing integration_configs, use the slug as the key (e.g., {"sharepoint": {}, "ms365-mail": {}}).
"""


class BuilderSession:
    def __init__(self, session_id: str, tool_mode: str = "native"):
        self.session_id = session_id
        self.tool_mode = tool_mode
        self.history: list[dict[str, str]] = []
        self.draft: AgentDraft = AgentDraft()
        self.created_at: float = time.time()
        self.llm_messages: list[dict] = [
            {"role": "system", "content": BUILDER_SYSTEM_PROMPT}
        ]

    def is_expired(self, ttl_seconds: int = 1800) -> bool:
        return (time.time() - self.created_at) > ttl_seconds


_sessions: dict[str, BuilderSession] = {}


def create_builder_session(tool_mode: str = "native") -> BuilderSession:
    session_id = uuid.uuid4().hex[:16]
    session = BuilderSession(session_id, tool_mode)
    _sessions[session_id] = session
    return session


def get_builder_session(session_id: str) -> BuilderSession | None:
    session = _sessions.get(session_id)
    if session and session.is_expired():
        _sessions.pop(session_id, None)
        return None
    return session


def purge_expired_sessions() -> int:
    expired = [sid for sid, s in _sessions.items() if s.is_expired()]
    for sid in expired:
        _sessions.pop(sid, None)
    return len(expired)


def _get_builder_tools() -> list[dict]:
    return [
        {
            "type": "function",
            "function": {
                "name": "list_capabilities",
                "description": "List all available integration packages and their status (installed/not installed).",
                "parameters": {"type": "object", "properties": {}},
            },
        },
        {
            "type": "function",
            "function": {
                "name": "list_runtime_profiles",
                "description": "List available runtime profiles and their default toolsets.",
                "parameters": {"type": "object", "properties": {}},
            },
        },
        {
            "type": "function",
            "function": {
                "name": "propose_agent_draft",
                "description": "Propose or update the agent draft. Call this when you have enough information to create a complete agent.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string", "description": "Agent identifier (kebab-case)"},
                        "friendly_name": {"type": "string", "description": "Display name"},
                        "description": {"type": "string", "description": "What the agent does"},
                        "system_prompt": {"type": "string", "description": "Instructions for the agent"},
                        "runtime_profile": {"type": "string", "enum": ["standard", "technical", "security"]},
                        "integration_configs": {
                            "type": "object",
                            "description": "Map of integration slug to config dict",
                        },
                        "ready_to_create": {"type": "boolean", "description": "True when the draft is complete and user confirmed"},
                    },
                    "required": ["friendly_name", "system_prompt", "runtime_profile"],
                },
            },
        },
    ]


async def _execute_tool(
    tool_name: str,
    arguments: dict,
    session: BuilderSession,
    db: AsyncSession,
) -> str:
    if tool_name == "list_capabilities":
        settings = await db.get(AppSettings, "default")
        enabled = settings.enabled_integration_packages if settings else []
        packages = list_available_integration_packages(enabled)
        summary = [
            {
                "slug": p["slug"],
                "name": p.get("name", p["slug"]),
                "description": p.get("description", ""),
                "installed": p.get("installed", False),
                "required_fields": p.get("required_fields", []),
            }
            for p in packages
        ]
        return json.dumps(summary)

    if tool_name == "list_runtime_profiles":
        return json.dumps([
            {"slug": "standard", "description": "General-purpose agent with safe tools, browser, file, memory, vision"},
            {"slug": "technical", "description": "Adds code execution, git, and terminal access"},
            {"slug": "security", "description": "Adds security scanning and network tools"},
        ])

    if tool_name == "propose_agent_draft":
        draft_data = {k: v for k, v in arguments.items() if k != "ready_to_create"}
        for key, val in draft_data.items():
            if hasattr(session.draft, key):
                setattr(session.draft, key, val)
        ready = arguments.get("ready_to_create", False)
        return json.dumps({"status": "updated", "ready_to_create": ready})

    return json.dumps({"error": f"Unknown tool: {tool_name}"})


def _compute_required_connectors(
    draft: AgentDraft,
    enabled_slugs: list[str],
) -> list[RequiredConnector]:
    if not draft.integration_configs:
        return []

    enabled_set = set(enabled_slugs)
    all_packages = list_available_integration_packages(enabled_slugs)
    pkg_by_slug = {p["slug"]: p for p in all_packages}

    result: list[RequiredConnector] = []
    for slug in draft.integration_configs:
        pkg = pkg_by_slug.get(slug)
        if not pkg:
            continue

        installed = slug in enabled_set
        required_fields = pkg.get("required_fields", [])
        pkg_name = pkg.get("name", slug)

        if installed:
            admin_instructions = ""
        else:
            fields_str = ", ".join(required_fields) if required_fields else "sin campos adicionales"
            admin_instructions = (
                f"Pide a tu administrador que habilite '{pkg_name}' en "
                f"Ajustes → Integraciones y configure: {fields_str}."
            )

        result.append(RequiredConnector(
            slug=slug,
            name=pkg_name,
            installed=installed,
            required_fields=required_fields,
            admin_instructions=admin_instructions,
        ))

    return result


async def resolve_builder_llm(
    db: AsyncSession,
) -> tuple[str | None, str | None, str | None]:
    """Resolve the LLM provider and model for the builder.

    Returns (api_key, model, base_url) or (None, None, None) if unavailable.
    """
    from hermeshq.models.secret import Secret
    from hermeshq.services.secret_vault import SecretVault
    from hermeshq.config import get_settings
    from sqlalchemy import select

    settings = get_settings()
    app_settings = await db.get(AppSettings, "default")

    model = None
    api_key = None
    base_url = None

    if app_settings:
        model = app_settings.default_model
        base_url = app_settings.default_base_url
        if app_settings.default_api_key_ref:
            try:
                result = await db.execute(
                    select(Secret).where(Secret.name == app_settings.default_api_key_ref)
                )
                secret = result.scalar_one_or_none()
                if secret:
                    vault = SecretVault(settings.jwt_secret)
                    api_key = vault.decrypt(secret.value_enc)
            except Exception:
                logger.warning("Failed to resolve builder API key", exc_info=True)

    if not base_url:
        base_url = "https://api.openai.com/v1"

    return api_key, model, base_url


def _extract_inline_tool_calls(text: str) -> list[tuple[str, dict[str, Any]]]:
    """Extract tool calls from LLM text output (XML-like format).

    Returns list of (function_name, arguments_dict).
    """
    import re

    calls: list[tuple[str, dict[str, Any]]] = []

    for block in re.finditer(r"<tool_call>\s*(.*?)\s*</tool_call>", text, re.DOTALL):
        inner = block.group(1)
        func_match = re.search(r"<function=([\w_]+)>", inner)
        if not func_match:
            continue

        func_name = func_match.group(1)
        params: dict[str, Any] = {}

        for param_match in re.finditer(r"<parameter=([\w_]+)>\s*(.*?)\s*</parameter>", inner, re.DOTALL):
            key = param_match.group(1)
            val = param_match.group(2).strip()
            if val.lower() in ("true", "false"):
                params[key] = val.lower() == "true"
            elif val.startswith("{") or val.startswith("["):
                try:
                    params[key] = json.loads(val)
                except Exception:
                    params[key] = val
            else:
                params[key] = val

        calls.append((func_name, params))

    return calls


def _strip_tool_call_blocks(text: str) -> str:
    """Remove <tool_call>...</tool_call> blocks from text and clean up whitespace."""
    import re

    clean = re.sub(r"<tool_call>.*?</tool_call>", "", text, flags=re.DOTALL).strip()
    clean = re.sub(r"\n{3,}", "\n\n", clean)
    return clean


def _parse_inline_tool_calls(
    text: str,
    session: BuilderSession,
    db: AsyncSession,
) -> tuple[str, bool]:
    """Detect and execute tool calls embedded in LLM text output.

    Many models (especially free/smaller ones) don't support native tool-calling
    via the OpenAI API ``tools=`` parameter. Instead they emit XML-like blocks
    in the response text:

        <tool_call> <function=propose_agent_draft> <parameter=name> ... </parameter> ... </tool_call>

    This function strips those blocks from the visible text and applies the
    draft changes to the session, returning (clean_text, ready_to_create).
    """
    import re

    ready_flag = False

    # Pattern: <tool_call> ... </tool_call>
    tool_call_blocks = re.findall(r"<tool_call>\s*(.*?)\s*</tool_call>", text, re.DOTALL)

    if not tool_call_blocks:
        # Also try JSON blocks: ```json { ... } ```
        json_match = re.search(r"```json\s*(\{.*?\})\s*```", text, re.DOTALL)
        if json_match:
            try:
                data = json.loads(json_match.group(1))
                if "friendly_name" in data or "system_prompt" in data:
                    tool_call_blocks = [json_match.group(0)]
            except Exception:
                pass

    if not tool_call_blocks:
        return text, False

    for block in tool_call_blocks:
        func_match = re.search(r"<function=([\w_]+)>", block)
        if not func_match:
            continue

        func_name = func_match.group(1)

        params: dict[str, Any] = {}
        for param_match in re.finditer(r"<parameter=([\w_]+)>\s*(.*?)\s*</parameter>", block, re.DOTALL):
            key = param_match.group(1)
            val = param_match.group(2).strip()
            if val.lower() in ("true", "false"):
                params[key] = val.lower() == "true"
            elif val.startswith("{") or val.startswith("["):
                try:
                    params[key] = json.loads(val)
                except Exception:
                    params[key] = val
            else:
                params[key] = val

        if func_name == "propose_agent_draft":
            draft_data = {k: v for k, v in params.items() if k != "ready_to_create"}
            for key, val in draft_data.items():
                if hasattr(session.draft, key):
                    setattr(session.draft, key, val)
            ready_flag = params.get("ready_to_create", False)

    clean_text = re.sub(r"<tool_call>.*?</tool_call>", "", text, flags=re.DOTALL).strip()
    clean_text = re.sub(r"\n{3,}", "\n\n", clean_text)

    return clean_text or "He preparado el borrador del agente. Revisa el panel lateral para ver los detalles.", ready_flag


async def process_builder_message(
    session: BuilderSession,
    user_text: str,
    db: AsyncSession,
) -> AgentBuilderTurn:
    """Process a user message and return a builder turn.

    This calls the LLM with tools, executes tool calls, and returns
    the assistant response + updated draft.
    """
    import openai

    api_key, model, base_url = await resolve_builder_llm(db)

    if not api_key or not model:
        return AgentBuilderTurn(
            assistant_text="No hay un modelo de IA configurado. Contacta al administrador para configurar un proveedor en Ajustes.",
            draft=session.draft,
            required_connectors=[],
            ready_to_create=False,
        )

    session.llm_messages.append({"role": "user", "content": user_text})

    client = openai.AsyncOpenAI(api_key=api_key, base_url=base_url)

    try:
        tools = _get_builder_tools() if session.tool_mode == "native" else None
        response = await client.chat.completions.create(
            model=model,
            messages=session.llm_messages,
            tools=tools,
            temperature=0.7,
            max_tokens=2000,
        )

        message = response.choices[0].message

        if message.tool_calls:
            session.llm_messages.append({
                "role": "assistant",
                "content": message.content or "",
                "tool_calls": [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {"name": tc.function.name, "arguments": tc.function.arguments},
                    }
                    for tc in message.tool_calls
                ],
            })

            ready_flag = False
            for tc in message.tool_calls:
                args = json.loads(tc.function.arguments)
                result = await _execute_tool(tc.function.name, args, session, db)
                if tc.function.name == "propose_agent_draft":
                    parsed = json.loads(result)
                    ready_flag = parsed.get("ready_to_create", False)

            follow_up = await client.chat.completions.create(
                model=model,
                messages=session.llm_messages,
                temperature=0.7,
                max_tokens=2000,
            )
            assistant_text = follow_up.choices[0].message.content or ""
            session.llm_messages.append({"role": "assistant", "content": assistant_text})
        else:
            assistant_text = message.content or ""

            # Fallback: detect inline tool calls in text (models without native tool-calling)
            parsed_calls = _extract_inline_tool_calls(assistant_text)

            if parsed_calls:
                clean_text = _strip_tool_call_blocks(assistant_text)
                session.llm_messages.append({"role": "assistant", "content": clean_text})

                ready_flag = False
                for tc_name, tc_args in parsed_calls:
                    result = await _execute_tool(tc_name, tc_args, session, db)
                    if tc_name == "propose_agent_draft":
                        parsed = json.loads(result)
                        ready_flag = parsed.get("ready_to_create", False)
                    session.llm_messages.append({"role": "user", "content": f"[Tool result for {tc_name}]: {result}"})

                # Follow-up so the LLM gives a natural response with the tool data
                follow_up = await client.chat.completions.create(
                    model=model,
                    messages=session.llm_messages,
                    temperature=0.7,
                    max_tokens=2000,
                )
                assistant_text = follow_up.choices[0].message.content or ""
                # Check if follow-up also has tool calls (multi-step reasoning)
                followup_calls = _extract_inline_tool_calls(assistant_text)
                if followup_calls:
                    assistant_text, ready_flag = _parse_inline_tool_calls(assistant_text, session, db)
                session.llm_messages.append({"role": "assistant", "content": assistant_text})
            else:
                session.llm_messages.append({"role": "assistant", "content": assistant_text})

    except Exception:
        logger.error("Builder LLM call failed", exc_info=True)
        return AgentBuilderTurn(
            assistant_text="Lo siento, hubo un error al procesar tu mensaje. Por favor intenta de nuevo.",
            draft=session.draft,
            required_connectors=[],
            ready_to_create=False,
        )

    settings = await db.get(AppSettings, "default")
    enabled_slugs = settings.enabled_integration_packages if settings else []
    required = _compute_required_connectors(session.draft, enabled_slugs)

    return AgentBuilderTurn(
        assistant_text=assistant_text,
        draft=session.draft,
        required_connectors=required,
        ready_to_create=session.draft.friendly_name is not None
        and session.draft.system_prompt is not None,
    )


async def finalize_agent_from_draft(
    session: BuilderSession,
    db: AsyncSession,
    app_state: object,
    created_by_user_id: str = "",
) -> tuple[str, str]:
    """Create an agent from the builder draft.

    Returns (agent_id, agent_name).
    Raises on validation errors.
    """
    from hermeshq.schemas.agent import AgentCreate
    from hermeshq.services.agent_factory import create_agent_from_config
    from sqlalchemy import select
    from hermeshq.models.node import Node

    draft = session.draft
    agent_name = draft.name or draft.friendly_name or "ai-agent"
    if not draft.friendly_name or not draft.system_prompt:
        raise ValueError("Draft is incomplete: friendly_name and system_prompt are required")

    node_result = await db.execute(select(Node).limit(1))
    node = node_result.scalar_one_or_none()
    if not node:
        raise ValueError("No node available for agent creation")

    payload = AgentCreate(
        node_id=node.id,
        name=agent_name,
        friendly_name=draft.friendly_name,
        slug=draft.slug or agent_name.lower().replace(" ", "-"),
        description=draft.description,
        runtime_profile=draft.runtime_profile,
        system_prompt=draft.system_prompt,
        enabled_toolsets=draft.enabled_toolsets,
        integration_configs=draft.integration_configs,
    )

    workspace_manager = getattr(app_state, "workspace_manager", None)
    hermes_version_manager = getattr(app_state, "hermes_version_manager", None)

    if not workspace_manager or not hermes_version_manager:
        raise ValueError("Server is not fully initialized. Please try again.")

    agent = await create_agent_from_config(
        db=db,
        payload=payload,
        workspace_manager=workspace_manager,
        hermes_version_manager=hermes_version_manager,
    )

    try:
        from hermeshq.services.audit import record_audit
        await record_audit(
            db,
            actor_id=created_by_user_id,
            action="agent.created_via_builder",
            target_type="agent",
            target_id=str(agent.id),
            target_name=str(agent.name),
            details={"draft": draft.model_dump()},
        )
    except Exception:
        logger.warning("Failed to record audit for builder agent creation", exc_info=True)

    return str(agent.id), str(agent.name)
