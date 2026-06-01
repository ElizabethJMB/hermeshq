from __future__ import annotations

import json
import os
import urllib.error
import urllib.request

GRAPH_BASE = "https://graph.microsoft.com/v1.0"
TOOLSET = "hermeshq_sharepoint"


def _task_user_id() -> str | None:
    raw = os.environ.get("HERMESHQ_TASK_PAYLOAD", "")
    if not raw:
        return None
    try:
        payload = json.loads(raw)
        meta = payload.get("metadata") or {}
        return str(meta.get("thread_user_id") or meta.get("created_by_user_id") or "").strip() or None
    except Exception:
        return None


def _get_m365_token(user_id: str) -> tuple[str | None, str]:
    base_url = os.environ.get("HERMESHQ_INTERNAL_API_URL", "").rstrip("/")
    agent_id = os.environ.get("HERMESHQ_AGENT_ID", "")
    agent_token = os.environ.get("HERMESHQ_AGENT_TOKEN", "")
    if not base_url or not agent_id or not agent_token:
        return None, "HermesHQ internal control no configurado"

    url = f"{base_url}/m365/agent-token?user_id={user_id}"
    req = urllib.request.Request(
        url,
        method="GET",
        headers={
            "X-HermesHQ-Agent-ID": agent_id,
            "X-HermesHQ-Agent-Token": agent_token,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data.get("access_token"), ""
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        try:
            detail = json.loads(body).get("detail", body)
        except Exception:
            detail = body
        return None, str(detail)
    except Exception as exc:
        return None, str(exc)


def _graph(method: str, path: str, access_token: str, payload: dict | None = None) -> dict:
    url = f"{GRAPH_BASE}{path}"
    data = json.dumps(payload).encode("utf-8") if payload else None
    req = urllib.request.Request(
        url,
        data=data,
        method=method.upper(),
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        try:
            return {"error": json.loads(body)}
        except Exception:
            return {"error": body, "status": exc.code}


def _auth_error(detail: str) -> str:
    return json.dumps({
        "success": False,
        "error": f"No se pudo obtener token M365: {detail}. Verifica que el usuario haya conectado su cuenta Microsoft 365 en Mi cuenta.",
    })


# ── Tool handlers ─────────────────────────────────────────────────────────────

def _list_sites_tool(args: dict, **_kwargs) -> str:
    user_id = _task_user_id()
    if not user_id:
        return json.dumps({"success": False, "error": "No se pudo determinar el usuario de esta tarea."})
    token, err = _get_m365_token(user_id)
    if not token:
        return _auth_error(err)
    search = str(args.get("search") or "").strip()
    if search:
        path = f"/sites?search={search}"
    else:
        path = "/sites?search=*"
    result = _graph("GET", path, token)
    if "error" in result:
        return json.dumps({"success": False, "error": result["error"]})
    sites = result.get("value", [])
    simplified = [{"id": s.get("id"), "name": s.get("displayName"), "url": s.get("webUrl")} for s in sites]
    return json.dumps({"success": True, "count": len(simplified), "sites": simplified}, ensure_ascii=False)


def _list_files_tool(args: dict, **_kwargs) -> str:
    user_id = _task_user_id()
    if not user_id:
        return json.dumps({"success": False, "error": "No se pudo determinar el usuario de esta tarea."})
    token, err = _get_m365_token(user_id)
    if not token:
        return _auth_error(err)
    site_id = str(args.get("site_id") or "").strip()
    folder_path = str(args.get("folder_path") or "").strip("/")
    if not site_id:
        return json.dumps({"success": False, "error": "Se requiere site_id."})
    if folder_path:
        path = f"/sites/{site_id}/drive/root:/{folder_path}:/children"
    else:
        path = f"/sites/{site_id}/drive/root/children"
    result = _graph("GET", path, token)
    if "error" in result:
        return json.dumps({"success": False, "error": result["error"]})
    items = result.get("value", [])
    simplified = [
        {"id": i.get("id"), "name": i.get("name"), "type": "folder" if "folder" in i else "file",
         "size": i.get("size"), "url": i.get("webUrl")}
        for i in items
    ]
    return json.dumps({"success": True, "count": len(simplified), "items": simplified}, ensure_ascii=False)


def _get_file_tool(args: dict, **_kwargs) -> str:
    user_id = _task_user_id()
    if not user_id:
        return json.dumps({"success": False, "error": "No se pudo determinar el usuario de esta tarea."})
    token, err = _get_m365_token(user_id)
    if not token:
        return _auth_error(err)
    site_id = str(args.get("site_id") or "").strip()
    item_id = str(args.get("item_id") or "").strip()
    if not site_id or not item_id:
        return json.dumps({"success": False, "error": "Se requieren site_id e item_id."})
    result = _graph("GET", f"/sites/{site_id}/drive/items/{item_id}", token)
    if "error" in result:
        return json.dumps({"success": False, "error": result["error"]})
    return json.dumps({"success": True, "item": result}, ensure_ascii=False)


def _search_tool(args: dict, **_kwargs) -> str:
    user_id = _task_user_id()
    if not user_id:
        return json.dumps({"success": False, "error": "No se pudo determinar el usuario de esta tarea."})
    token, err = _get_m365_token(user_id)
    if not token:
        return _auth_error(err)
    query = str(args.get("query") or "").strip()
    if not query:
        return json.dumps({"success": False, "error": "Se requiere query."})
    payload = {
        "requests": [{
            "entityTypes": ["driveItem", "listItem"],
            "query": {"queryString": query},
            "from": 0,
            "size": min(int(args.get("count") or 10), 25),
        }]
    }
    result = _graph("POST", "/search/query", token, payload)
    if "error" in result:
        return json.dumps({"success": False, "error": result["error"]})
    hits = []
    for resp in result.get("value", []):
        for hit_container in resp.get("hitsContainers", []):
            hits.extend(hit_container.get("hits", []))
    return json.dumps({"success": True, "count": len(hits), "hits": hits}, ensure_ascii=False)


# ── Plugin registration ───────────────────────────────────────────────────────

def register(ctx):
    ctx.register_tool(
        name="sharepoint_list_sites",
        toolset=TOOLSET,
        schema={
            "name": "sharepoint_list_sites",
            "description": "Lista sitios SharePoint accesibles por el usuario.",
            "parameters": {
                "type": "object",
                "properties": {
                    "search": {"type": "string", "description": "Filtro por nombre de sitio (opcional)"},
                },
            },
        },
        handler=_list_sites_tool,
        description="Listar sitios SharePoint",
        emoji="🏢",
    )
    ctx.register_tool(
        name="sharepoint_list_files",
        toolset=TOOLSET,
        schema={
            "name": "sharepoint_list_files",
            "description": "Lista archivos y carpetas en un sitio SharePoint.",
            "parameters": {
                "type": "object",
                "properties": {
                    "site_id": {"type": "string", "description": "ID del sitio SharePoint"},
                    "folder_path": {"type": "string", "description": "Ruta de carpeta (opcional, ej: 'Documents/Projects')"},
                },
                "required": ["site_id"],
            },
        },
        handler=_list_files_tool,
        description="Listar archivos en SharePoint",
        emoji="📁",
    )
    ctx.register_tool(
        name="sharepoint_get_file",
        toolset=TOOLSET,
        schema={
            "name": "sharepoint_get_file",
            "description": "Obtiene información de un archivo o carpeta en SharePoint por su ID.",
            "parameters": {
                "type": "object",
                "properties": {
                    "site_id": {"type": "string", "description": "ID del sitio SharePoint"},
                    "item_id": {"type": "string", "description": "ID del archivo o carpeta"},
                },
                "required": ["site_id", "item_id"],
            },
        },
        handler=_get_file_tool,
        description="Obtener archivo de SharePoint",
        emoji="📄",
    )
    ctx.register_tool(
        name="sharepoint_search",
        toolset=TOOLSET,
        schema={
            "name": "sharepoint_search",
            "description": "Busca archivos y documentos en SharePoint usando Microsoft Search.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Término de búsqueda"},
                    "count": {"type": "integer", "description": "Número de resultados (máx 25, default 10)"},
                },
                "required": ["query"],
            },
        },
        handler=_search_tool,
        description="Buscar en SharePoint",
        emoji="🔍",
    )
