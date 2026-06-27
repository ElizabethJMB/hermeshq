from __future__ import annotations

import json
import os
import platform
import threading
from pathlib import Path


_WHISPER_LOCK = threading.Lock()
_WHISPER_MODEL = None
_WHISPER_MODEL_NAME: str | None = None

SUPPORTED_EXTS = {".m4a", ".ogg", ".mp3", ".wav", ".webm", ".flac", ".aac", ".opus", ".wma"}


def _default_whisper_model() -> str:
    machine = platform.machine().lower()
    if machine in ("aarch64", "arm64"):
        return "base"
    return "small"


def _load_whisper(model_name: str):
    global _WHISPER_MODEL, _WHISPER_MODEL_NAME
    with _WHISPER_LOCK:
        if _WHISPER_MODEL is not None and _WHISPER_MODEL_NAME == model_name:
            return _WHISPER_MODEL
        from faster_whisper import WhisperModel
        _WHISPER_MODEL = WhisperModel(model_name, device="cpu", compute_type="int8")
        _WHISPER_MODEL_NAME = model_name
        return _WHISPER_MODEL


def _decode_audio(file_path: str):
    """Decode any audio file to 16kHz mono float32 numpy array using PyAV."""
    import io

    import av
    import numpy as np

    container = av.open(file_path)
    resampler = av.AudioResampler(format="fltp", layout="mono", rate=16000)

    audio_frames: list[np.ndarray] = []
    for frame in container.decode(audio=0):
        for rf in resampler.resample(frame):
            array = rf.to_ndarray()
            if array.ndim > 1:
                array = array.reshape(-1)
            audio_frames.append(array.astype(np.float32))

    for rf in resampler.resample(None):
        array = rf.to_ndarray()
        if array.ndim > 1:
            array = array.reshape(-1)
        audio_frames.append(array.astype(np.float32))

    container.close()

    if not audio_frames:
        return None

    audio = np.concatenate(audio_frames).astype(np.float32)
    return np.clip(audio, -1.0, 1.0)


def _handle_transcribe_audio(args, **_kwargs):
    file_path = args.get("file_path", "")
    language = args.get("language", "")

    if not file_path:
        return json.dumps({"success": False, "error": "file_path is required"})

    ext = Path(file_path).suffix.lower()
    if ext not in SUPPORTED_EXTS:
        return json.dumps({
            "success": False,
            "error": f"Unsupported audio format: '{ext}'. Supported: {', '.join(sorted(SUPPORTED_EXTS))}",
        })

    if not os.path.isabs(file_path):
        cwd = os.environ.get("HERMES_SESSION_CWD", os.getcwd())
        file_path = os.path.join(cwd, file_path)

    if not os.path.isfile(file_path):
        return json.dumps({"success": False, "error": f"File not found: {file_path}"})

    try:
        audio_array = _decode_audio(file_path)
    except Exception as exc:
        return json.dumps({"success": False, "error": f"Failed to decode audio: {exc}"})

    if audio_array is None or len(audio_array) < 100:
        return json.dumps({"success": False, "error": "Audio file is empty or too short"})

    model_name = _default_whisper_model()
    try:
        model = _load_whisper(model_name)
    except ImportError:
        return json.dumps({
            "success": False,
            "error": "faster-whisper is not installed. Audio transcription is unavailable.",
        })

    kwargs = {"beam_size": 5}
    lang = language.strip().lower() if language else ""
    if lang and lang != "auto":
        kwargs["language"] = lang

    try:
        segments, info = model.transcribe(audio_array, **kwargs)
        text = " ".join(seg.text.strip() for seg in segments).strip()
        detected_lang = getattr(info, "language", lang or "unknown")
    except Exception as exc:
        return json.dumps({"success": False, "error": f"Transcription failed: {exc}"})

    duration = len(audio_array) / 16000.0

    return json.dumps({
        "success": True,
        "text": text,
        "language": detected_lang,
        "duration_seconds": round(duration, 1),
        "model": model_name,
        "file": file_path,
    })


def register(ctx):
    spec = {
        "name": "hq_transcribe_audio",
        "description": (
            "Transcribe an audio file to text. Supports m4a, ogg, mp3, wav, webm, flac, aac, opus, and wma. "
            "Use this when the user sends an audio file or voice message and you need to know what's in it. "
            "The file_path should be relative to the workspace root (e.g. 'uploads/audio.m4a')."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string",
                    "description": "Path to the audio file (relative to workspace or absolute)",
                },
                "language": {
                    "type": "string",
                    "description": "Language code (e.g. 'es' for Spanish, 'en' for English). Use 'auto' for auto-detection. Defaults to 'auto'.",
                },
            },
            "required": ["file_path"],
        },
        "handler": _handle_transcribe_audio,
    }

    ctx.register_tool(
        name=spec["name"],
        toolset="hermeshq_audio",
        schema={
            "name": spec["name"],
            "description": spec["description"],
            "parameters": spec["parameters"],
        },
        handler=spec["handler"],
        emoji="🎵",
    )
