# Mobile Attachments — Mejoras Futuras

> Generado a partir del review de PR #13 (`feat/mobile-attachments`), mergeado en `1bb4716`.

## Observaciones no bloqueantes del review

### 1. Validar formato UUID en download/delete

**Problema:** `file_id` se usa directamente en un glob sin validar formato.

```python
# actual — glob con file_id sin validar
matches = list(uploads.glob(f"{file_id}.*"))
```

**Mejora:**
```python
import uuid

# validar que file_id es un UUID válido
try:
    uuid.UUID(file_id)
except ValueError:
    raise HTTPException(status_code=400, detail="Invalid file_id format")
```

**Riesgo actual:** Bajo — FastAPI sanitiza path params, pero es defensa en profundidad.

---

### 2. Streaming upload en vez de read completo en memoria

**Problema:** `content = await file.read()` carga el archivo entero en RAM antes de validar tamaño. Para 100MB × N uploads concurrentes, puede ser problema.

**Mejora:**
```python
import shutil
import tempfile

MAX_FILE_SIZE = 100 * 1024 * 1024

file_id = str(uuid.uuid4())
safe_filename = f"{file_id}{ext}"
uploads = _uploads_dir(request.app.state.workspace_manager, agent_id)
file_path = uploads / safe_filename

# Validar tamaño incrementalmente, escribir por chunks
total = 0
with tempfile.NamedTemporaryFile(delete=False, dir=uploads, suffix=".tmp") as tmp:
    while chunk := await file.read(1024 * 1024):  # 1MB chunks
        total += len(chunk)
        if total > MAX_FILE_SIZE:
            tmp.close()
            Path(tmp.name).unlink()
            raise HTTPException(status_code=413, detail="File too large")
        tmp.write(chunk)
    tmp_path = Path(tmp.name)

tmp_path.rename(file_path)
```

**Prioridad:** Media. Actualmente funciona bien para uso normal, pero conviene antes de escalar.

---

### 3. Cleanup automático de attachments huérfanos

**Problema:** No hay mecanismo para limpiar archivos cuando:
- Se elimina una tarea con attachments
- Se elimina un agente con uploads
- Un upload queda huérfano (no referenciado en ningún `metadata_json`)

**Mejora:** Agregar al workspace cleanup existente en `WorkspaceManager.delete_workspace()`:

```python
# workspace_manager.py — delete_workspace ya existe
def delete_workspace(self, agent_id: str) -> None:
    workspace = self.build_workspace_path(agent_id)
    if workspace.exists():
        shutil.rmtree(workspace, ignore_errors=True)
    # uploads/ ya está dentro de workspace, así que se borra con él ✅
```

Para cleanup periódico de huérfanos, se podría agregar un background task:

```python
# Nuevo: cleanup de uploads no referenciados en metadata_json
async def cleanup_orphan_uploads(db: AsyncSession, workspace_manager) -> int:
    """Remove upload files not referenced in any task's metadata_json."""
    from hermeshq.models.task import Task
    from hermeshq.models.agent import Agent

    result = await db.execute(select(Agent))
    agents = result.scalars().all()

    removed = 0
    for agent in agents:
        uploads_dir = workspace_manager.build_workspace_path(str(agent.id)) / "uploads"
        if not uploads_dir.exists():
            continue

        # Collect all referenced file_ids
        ref_result = await db.execute(
            select(Task.metadata_json).where(Task.agent_id == agent.id)
        )
        referenced = set()
        for meta in ref_result.scalars():
            for att in (meta or {}).get("attachments", []):
                if "path" in att:
                    referenced.add(Path(att["path"]).stem)  # file_id

        # Remove unreferenced files older than 24h
        for f in uploads_dir.iterdir():
            if f.stem not in referenced and f.is_file():
                age_hours = (time.time() - f.stat().st_mtime) / 3600
                if age_hours > 24:
                    f.unlink()
                    removed += 1

    return removed
```

**Prioridad:** Baja. Por ahora el disco no crecerá descontroladamente.

---

### 4. Límite de storage por agente

**Problema:** No hay límite de cuántos archivos/cuánto espacio puede usar un agente.

**Mejora:** Agregar quota configurable:

```python
MAX_AGENT_STORAGE_MB = int(os.getenv("HQ_MAX_AGENT_STORAGE_MB", "500"))

def _check_storage_limit(uploads_dir: Path, incoming_bytes: int) -> None:
    current = sum(f.stat().st_size for f in uploads_dir.rglob("*") if f.is_file())
    if current + incoming_bytes > MAX_AGENT_STORAGE_MB * 1024 * 1024:
        raise HTTPException(
            status_code=507,
            detail=f"Storage limit exceeded ({MAX_AGENT_STORAGE_MB}MB)",
        )
```

**Prioridad:** Baja. Relevante solo si hay muchos usuarios con devices distintos.

---

### 5. No crear directorio uploads en GET/DELETE

**Problema:** `_uploads_dir()` hace `mkdir(parents=True, exist_ok=True)` en todos los endpoints, incluyendo GET y DELETE.

**Mejora:** Separar la creación del directorio solo en upload:

```python
def _uploads_dir(workspace_manager, agent_id: str) -> Path:
    """Return uploads path without creating it."""
    workspace = workspace_manager.build_workspace_path(agent_id)
    return workspace / "uploads"

# Solo en upload_attachment:
uploads = _uploads_dir(request.app.state.workspace_manager, agent_id)
uploads.mkdir(parents=True, exist_ok=True)
```

**Prioridad:** Cosmética.

---

## Resumen de prioridades

| # | Mejora | Prioridad | Esfuerzo |
|---|--------|-----------|----------|
| 1 | Validar UUID en file_id | Media (defensa en profundidad) | 5 min |
| 2 | Streaming upload | Media (escalar) | 30 min |
| 3 | Cleanup huérfanos | Baja | 1 hr |
| 4 | Quota por agente | Baja | 30 min |
| 5 | No mkdir en GET/DELETE | Cosmética | 5 min |
