import json
import os
import shutil
import sys
import traceback
import uuid
from pathlib import Path


# ── Response attachment limits ──────────────────────────────────
ALLOWED_RESPONSE_EXTENSIONS = {
    ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg",
    ".mp3", ".aac", ".ogg", ".wav", ".m4a", ".flac",
    ".mp4", ".webm", ".mov", ".avi", ".mkv",
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    ".txt", ".csv", ".json", ".md", ".xml", ".html", ".zip",
}
MAX_RESPONSE_FILE_SIZE = 100 * 1024 * 1024   # 100 MB per file
MAX_RESPONSE_FILES = 20                       # cap per task

# MIME type map for common extensions (copied from attachments.py)
_EXT_MIME_MAP = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
    ".gif": "image/gif", ".webp": "image/webp", ".bmp": "image/bmp",
    ".svg": "image/svg+xml",
    ".mp3": "audio/mpeg", ".aac": "audio/aac", ".ogg": "audio/ogg",
    ".wav": "audio/wav", ".m4a": "audio/mp4", ".flac": "audio/flac",
    ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime",
    ".avi": "video/x-msvideo", ".mkv": "video/x-matroska",
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".txt": "text/plain", ".csv": "text/csv", ".json": "application/json",
    ".md": "text/markdown", ".xml": "application/xml", ".html": "text/html",
    ".zip": "application/zip",
}


def _emit(payload: dict) -> None:
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def _snapshot_directory(directory: Path) -> dict[str, dict]:
    """Return {relative_path: {path, name, ext, size, mtime}} for all files."""
    snapshot: dict[str, dict] = {}
    if not directory.exists():
        return snapshot
    for path in directory.rglob("*"):
        if path.is_file():
            try:
                stat = path.stat()
            except OSError:
                continue
            rel = str(path.relative_to(directory))
            snapshot[rel] = {
                "path": path,
                "name": path.name,
                "ext": path.suffix.lower(),
                "size": stat.st_size,
                "mtime": stat.st_mtime,
            }
    return snapshot


def _diff_snapshots(pre: dict, post: dict) -> list[dict]:
    """Return files that are new or modified (by mtime + size)."""
    result: list[dict] = []
    for rel, info in post.items():
        if rel not in pre:
            result.append(info)
        elif info["mtime"] != pre[rel]["mtime"] or info["size"] != pre[rel]["size"]:
            result.append(info)
    return result


def _collect_response_attachments(cwd: Path, pre_snapshot: dict) -> list[dict]:
    """Scan work/ for new/modified files since *pre_snapshot*, copy them to
    uploads/, and return metadata list suitable for the result payload."""
    work_dir = cwd / "work"
    post_snapshot = _snapshot_directory(work_dir)

    diff = _diff_snapshots(pre_snapshot, post_snapshot)

    # Filter by extension and size
    filtered = [
        f for f in diff
        if f["ext"] in ALLOWED_RESPONSE_EXTENSIONS
        and f["size"] <= MAX_RESPONSE_FILE_SIZE
        and f["size"] > 0
    ][:MAX_RESPONSE_FILES]

    uploads_dir = cwd / "uploads"
    uploads_dir.mkdir(parents=True, exist_ok=True)

    attachments: list[dict] = []
    for f in filtered:
        file_id = str(uuid.uuid4())
        dest_filename = f"{file_id}{f['ext']}"
        dest_path = uploads_dir / dest_filename
        try:
            shutil.copy2(f["path"], dest_path)
        except OSError:
            continue

        attachments.append({
            "file_id": file_id,
            "filename": f["name"],
            "media_type": _EXT_MIME_MAP.get(f["ext"], "application/octet-stream"),
            "size": f["size"],
            "caption": "",
            "source_path": str(f["path"]),  # internal only, stripped before client
        })

    return attachments


def _extract_tool_calls(messages: list[dict]) -> list[dict]:
    extracted: list[dict] = []
    for message in messages:
        if message.get("role") != "assistant":
            continue
        for tool_call in message.get("tool_calls", []) or []:
            extracted.append(
                {
                    "name": tool_call.get("function", {}).get("name", "tool"),
                    "status": "completed",
                    "payload": tool_call,
                }
            )
    return extracted


def main() -> int:
    payload_raw = os.environ.get("HERMESHQ_TASK_PAYLOAD", "")
    if not payload_raw:
        _emit({"event": "error", "error": "Missing HERMESHQ_TASK_PAYLOAD"})
        return 1

    payload = json.loads(payload_raw)
    os.environ["HERMES_HOME"] = payload["hermes_home"]
    os.environ["HERMES_QUIET"] = "1"
    os.environ.setdefault("TERM", "xterm-256color")

    os.chdir(payload["cwd"])

    # ── Auxiliary client env injection ─────────────────────────
    # When HermesHQ passes explicit api_key + base_url, the main agent
    # client is constructed directly. But the auxiliary clients (vision,
    # compression, etc.) resolve credentials independently via env vars.
    # Inject the agent's credentials so auxiliary tasks can use them too.
    _api_key = payload.get("api_key")
    _base_url = payload.get("base_url")
    if _api_key and _base_url:
        os.environ.setdefault("OPENAI_API_KEY", _api_key)
        os.environ.setdefault("OPENAI_BASE_URL", _base_url)
        for _task in ("vision", "compression", "session_search", "web_extract"):
            os.environ.setdefault(f"AUXILIARY_{_task.upper()}_API_KEY", _api_key)
            os.environ.setdefault(f"AUXILIARY_{_task.upper()}_BASE_URL", _base_url)
    # ── End auxiliary client env injection ─────────────────────

    # ── Attachment enrichment ──────────────────────────────────
    task_metadata = payload.get("metadata", {})
    attachments = task_metadata.get("attachments", [])
    if attachments:
        attachment_lines = []
        for att in attachments:
            att_path = att.get("path", "")
            if att_path:
                full_path = Path(payload["cwd"]) / att_path
                if full_path.exists():
                    line = f"- [{att.get('media_type', 'file')}] {att_path}"
                    if att.get('filename'):
                        line += f" (filename: {att['filename']})"
                    if att.get('caption'):
                        line += f" — {att['caption']}"
                    attachment_lines.append(line)
        if attachment_lines:
            payload["prompt"] += "\n\nAttached files:\n" + "\n".join(attachment_lines)
    # ── End attachment enrichment ──────────────────────────────

    # ── Snapshot work/ BEFORE execution (for response attachment detection) ──
    _pre_work_snapshot = _snapshot_directory(Path(payload["cwd"]) / "work")
    # ── End pre-execution snapshot ─────────────────────────────

    try:
        from run_agent import AIAgent

        emitted_chunks: list[str] = []

        def on_delta(delta: str) -> None:
            emitted_chunks.append(delta)
            _emit({"event": "delta", "data": delta})

        agent = AIAgent(
            model=payload["model"],
            provider=payload.get("provider"),
            base_url=payload.get("base_url"),
            api_key=payload.get("api_key"),
            session_id=payload.get("session_id"),
            quiet_mode=True,
            enabled_toolsets=payload.get("enabled_toolsets") or None,
            disabled_toolsets=payload.get("disabled_toolsets") or None,
            ephemeral_system_prompt=payload.get("system_prompt"),
            max_iterations=payload.get("max_iterations", 90),
            skip_context_files=False,
            skip_memory=False,
            platform="hermeshq",
            stream_delta_callback=on_delta,
        )

        result = agent.run_conversation(
            user_message=payload["prompt"],
            task_id=payload["task_id"],
            system_message=payload.get("system_override"),
            conversation_history=payload.get("conversation_history") or None,
        )

        messages = result.get("messages", [])
        final_response = (result.get("final_response") or "".join(emitted_chunks)).strip()
        tool_calls = _extract_tool_calls(messages)
        assistant_messages = [message for message in messages if message.get("role") == "assistant"]
        if not final_response and not assistant_messages and not tool_calls:
            raise RuntimeError("Hermes runtime returned no assistant output")

        # ── Collect response attachments (files generated by the agent) ──
        response_attachments = _collect_response_attachments(
            Path(payload["cwd"]), _pre_work_snapshot
        )
        # ── End response attachment collection ──────────────────

        _emit(
            {
                "event": "result",
                "final_response": final_response,
                "messages": messages,
                "tool_calls": tool_calls,
                "tokens_used": max(256, len(str(result).split())),
                "iterations": len(assistant_messages),
                "engine": "hermes-agent",
                "response_attachments": response_attachments,
            }
        )
        return 0
    except Exception as exc:
        _emit(
            {
                "event": "error",
                "error": str(exc),
                "error_type": type(exc).__name__,
                "traceback": traceback.format_exc(),
            }
        )
        return 1


if __name__ == "__main__":
    sys.exit(main())
