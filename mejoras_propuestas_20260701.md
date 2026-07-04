# Mejoras Propuestas — 2026-07-01

Sugerencias identificadas durante revision de codigo, ordenadas por prioridad.

---

## Alta prioridad

### 1. Rate limiting en `/voice/stt`
- **Problema:** Whisper es CPU-intensivo. Sin rate limit, un usuario puede saturar el server con requests concurrentes. El semaforo interno (`_STT_SEMAPHORE`) limita concurrencia global, pero no hay limite por usuario.
- **Archivos:** `backend/hermeshq/routers/voice.py`, `backend/hermeshq/services/voice.py`
- **Sugerencia:** Agregar rate limiting por usuario (ej. max 5 transcripciones/minuto) usando `slowapi` o un middleware custom.

### 2. Builder sessions en memoria
- **Problema:** `_sessions` dict en `agent_builder.py` se pierde si el backend reinicia. Una conversacion a mitad se pierde.
- **Archivos:** `backend/hermeshq/services/agent_builder.py` (linea 97, `_sessions`)
- **Sugerencia:** Persistir sesiones en Redis o DB. Alternativamente, agregar un warning al usuario cuando la sesion es in-memory.

### 3. Historial LLM sin truncar
- **Problema:** `session.llm_messages` crece indefinidamente. Conversaciones largas exceden el context window del modelo, causando errores 400 de la API.
- **Archivos:** `backend/hermeshq/services/agent_builder.py` (linea 89, `BuilderSession.llm_messages`)
- **Sugerencia:** Truncar historial a las ultimas N mensajes (ej. 20), o implementar resumen automatico cuando se excede un threshold de tokens.

### 4. Race condition en gateway process manager
- **Problema:** Entre `self.processes.pop(agent_id)` (linea 208) y `self._launch_gateway_process()` (linea 223), otra corrutina puede lanzar un proceso duplicado para el mismo agente.
- **Archivos:** `backend/hermeshq/services/gateway_process_manager.py` (lineas 208-242)
- **Sugerencia:** Agregar un `asyncio.Lock` por `agent_id` alrededor de la seccion critica pop-launch.

---

## Media prioridad

### 5. Path hardcoded en script de transcripcion
- **Problema:** `_TRANSCRIBE_SCRIPT` tiene `sys.path.insert(0, "/app")` que solo funciona en Docker. En deployments bare-metal o Multipass VM falla silenciosamente.
- **Archivos:** `backend/hermeshq/plugin_templates/hermeshq_audio/__init__.py` (linea 15)
- **Sugerencia:** Detectar el path dinamicamente con `os.path.dirname(hermeshq.__file__)` o usar una variable de entorno `HERMESHQ_BACKEND_PATH`.

### 6. TTS sin semaforo
- **Problema:** STT tiene `_STT_SEMAPHORE` para limitar concurrencia, pero TTS no. Multiples requests TTS simultaneos (edge-tts o piper) pueden saturar el server.
- **Archivos:** `backend/hermeshq/services/voice.py` (funcion `synthesize`)
- **Sugerencia:** Agregar un semaforo similar al de STT, con limite mas alto (TTS es mas ligero que STT).

### 7. No graceful shutdown de gateways
- **Problema:** Si el backend se detiene (SIGTERM/SIGINT), los procesos gateway quedan huerfanos. No hay signal handler que los termine limpiamente.
- **Archivos:** `backend/hermeshq/services/gateway_process_manager.py`, `backend/hermeshq/main.py` (lifespan)
- **Sugerencia:** En el `lifespan` shutdown, iterar `self.processes` y llamar `_terminate_handle()` para cada uno.

### 8. Sin CI/CD pipeline
- **Problema:** No hay GitHub Actions. Los 360 tests solo corren manualmente. PRs pueden romper main sin deteccion.
- **Sugerencia:** Crear `.github/workflows/ci.yml` que ejecute `pytest` y `tsc --noEmit` en cada push/PR a `main` y `unstable`.

---

## Baja prioridad

### 9. Sin AGENTS.md
- **Problema:** No hay documentacion de comandos de lint/typecheck/test. Cada agente o desarrollador tiene que descubrirlos manualmente.
- **Sugerencia:** Crear `AGENTS.md` con: comando de tests (`backend/.venv/bin/python -m pytest tests/`), typecheck (`cd frontend && npx tsc --noEmit`), y notas de arquitectura.

### 10. PDF sin sanitizacion HTML
- **Problema:** El `html_content` del agente se inserta directamente en el template HTML sin sanitizacion. weasyprint no ejecuta JavaScript, pero HTML malformado puede causar errores de rendering o archivos enormes.
- **Archivos:** `backend/hermeshq/plugin_templates/hermeshq_pdf/__init__.py` (linea 113)
- **Sugerencia:** Usar `bleach` o `lxml.html.clean` para sanitizar el HTML antes de pasarlo a weasyprint.

### 11. Deteccion de silencio en STT
- **Problema:** Si el audio es puro silencio, Whisper puede tardar mucho tiempo procesando sin producir texto util.
- **Archivos:** `backend/hermeshq/services/voice.py` (funcion `_whisper_transcribe_sync`)
- **Sugerencia:** Agregar check de duracion minima (< 0.5s = rechazar) y/o RMS para detectar silencio antes de invocar Whisper.

### 12. Monitoring del gateway process
- **Problema:** El monitor solo espera a que el proceso salga. No hay health check periodico (ej. verificar que el gateway responde a pings).
- **Archivos:** `backend/hermeshq/services/gateway_process_manager.py` (funcion `_monitor_process`)
- **Sugerencia:** Agregar health check periodico cada 60s que verifique que el proceso sigue respondiendo, no solo que no haya salido.

---

## Resumen

| # | Mejora | Prioridad | Esfuerzo estimado |
|---|--------|-----------|-------------------|
| 1 | Rate limiting STT | Alta | Medio |
| 2 | Builder sessions persistentes | Alta | Alto |
| 3 | Truncar historial LLM | Alta | Bajo |
| 4 | Lock en gateway process manager | Alta | Bajo |
| 5 | Path dinamico en audio script | Media | Bajo |
| 6 | Semaforo TTS | Media | Bajo |
| 7 | Graceful shutdown gateways | Media | Medio |
| 8 | CI/CD con GitHub Actions | Media | Medio |
| 9 | AGENTS.md | Baja | Bajo |
| 10 | Sanitizacion HTML en PDF | Baja | Bajo |
| 11 | Deteccion de silencio STT | Baja | Medio |
| 12 | Health check gateway | Baja | Medio |
