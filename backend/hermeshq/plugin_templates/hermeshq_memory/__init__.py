from __future__ import annotations

import json
import os
import urllib.error
import urllib.request


def _api_request(method: str, path: str, payload: dict | None = None) -> str:
    base_url = os.environ.get("HERMESHQ_INTERNAL_API_URL", "").rstrip("/")
    agent_id = os.environ.get("HERMESHQ_AGENT_ID", "")
    agent_token = os.environ.get("HERMESHQ_AGENT_TOKEN", "")
    if not base_url or not agent_id or not agent_token:
        return json.dumps(
            {"success": False, "error": "HermesHQ internal communication is not configured in this runtime"}
        )

    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = urllib.request.Request(
        f"{base_url}{path}",
        data=data,
        method=method.upper(),
        headers={
            "Content-Type": "application/json",
            "X-HermesHQ-Agent-ID": agent_id,
            "X-HermesHQ-Agent-Token": agent_token,
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace").strip()
        try:
            parsed = json.loads(body) if body else {}
        except (json.JSONDecodeError, ValueError):
            parsed = {}
        return json.dumps(
            {
                "success": False,
                "status_code": exc.code,
                "error": parsed.get("detail") or parsed.get("error") or body or str(exc),
            }
        )
    except Exception as exc:  # noqa: BLE001  # HTTP request catch-all
        return json.dumps({"success": False, "error": str(exc)})


def hq_memory_list_tool(args, **_kwargs):
    return _api_request("GET", "/agents/self/memory")


def hq_memory_read_tool(args, **_kwargs):
    memory_key = (args.get("memory_key") or "").strip()
    if not memory_key:
        return json.dumps({"success": False, "error": "'memory_key' is required"})
    return _api_request("GET", f"/agents/self/memory/{memory_key}")


def hq_memory_write_tool(args, **_kwargs):
    memory_key = (args.get("memory_key") or "").strip()
    title = (args.get("title") or "").strip()
    content = (args.get("content") or "").strip()
    if not memory_key or not title or not content:
        return json.dumps({"success": False, "error": "'memory_key', 'title' and 'content' are required"})
    return _api_request(
        "POST",
        "/agents/self/memory",
        {
            "memory_key": memory_key,
            "title": title,
            "content": content,
            "category": args.get("category"),
        },
    )


def hq_memory_delete_tool(args, **_kwargs):
    memory_key = (args.get("memory_key") or "").strip()
    if not memory_key:
        return json.dumps({"success": False, "error": "'memory_key' is required"})
    return _api_request("DELETE", f"/agents/self/memory/{memory_key}")


def _check_requirements():
    return bool(
        os.environ.get("HERMESHQ_INTERNAL_API_URL")
        and os.environ.get("HERMESHQ_AGENT_ID")
        and os.environ.get("HERMESHQ_AGENT_TOKEN")
    )


def register(ctx):
    ctx.register_tool(
        name="hq_memory_list",
        toolset="hermeshq_memory",
        schema={
            "name": "hq_memory_list",
            "description": "List the memory notes saved for this agent across previous sessions (keys, titles, categories — no full content).",
            "parameters": {
                "type": "object",
                "properties": {},
            },
        },
        handler=hq_memory_list_tool,
        check_fn=_check_requirements,
        description="List saved memory notes for this agent",
        emoji="🧠",
    )
    ctx.register_tool(
        name="hq_memory_read",
        toolset="hermeshq_memory",
        schema={
            "name": "hq_memory_read",
            "description": "Read the full content of a saved memory note by its key.",
            "parameters": {
                "type": "object",
                "properties": {
                    "memory_key": {
                        "type": "string",
                        "description": "The short identifier of the memory note to read.",
                    },
                },
                "required": ["memory_key"],
            },
        },
        handler=hq_memory_read_tool,
        check_fn=_check_requirements,
        description="Read a saved memory note",
        emoji="🧠",
    )
    ctx.register_tool(
        name="hq_memory_write",
        toolset="hermeshq_memory",
        schema={
            "name": "hq_memory_write",
            "description": (
                "Save or update a persistent memory note for this agent so it can be recalled in future sessions. "
                "Use it for durable user preferences, project context, or feedback the user gave about how to work. "
                "Never store secrets or credentials here."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "memory_key": {
                        "type": "string",
                        "description": "Short stable identifier for this note (e.g. 'user_prefs', 'project_x_context'). Writing again with the same key overwrites it.",
                    },
                    "title": {
                        "type": "string",
                        "description": "Short human-readable title for this note.",
                    },
                    "content": {
                        "type": "string",
                        "description": "The note content, in markdown.",
                    },
                    "category": {
                        "type": "string",
                        "description": "Optional free-form category, e.g. 'user', 'feedback', 'project', 'reference'.",
                    },
                },
                "required": ["memory_key", "title", "content"],
            },
        },
        handler=hq_memory_write_tool,
        check_fn=_check_requirements,
        description="Save or update a persistent memory note",
        emoji="🧠",
    )
    ctx.register_tool(
        name="hq_memory_delete",
        toolset="hermeshq_memory",
        schema={
            "name": "hq_memory_delete",
            "description": "Delete a saved memory note by its key, e.g. because it is stale or was corrected.",
            "parameters": {
                "type": "object",
                "properties": {
                    "memory_key": {
                        "type": "string",
                        "description": "The short identifier of the memory note to delete.",
                    },
                },
                "required": ["memory_key"],
            },
        },
        handler=hq_memory_delete_tool,
        check_fn=_check_requirements,
        description="Delete a saved memory note",
        emoji="🧠",
    )
