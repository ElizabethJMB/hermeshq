"""Test page for the public chat widget. NOT for production use."""
from fastapi import APIRouter
from fastapi.responses import HTMLResponse

router = APIRouter(tags=["public-chat-test"])

TEST_PAGE_HTML = """<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Public Chat Widget — Test</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, -apple-system, sans-serif; background: #f5f5f5; color: #333; padding: 40px; }
  h1 { margin-bottom: 8px; }
  .subtitle { color: #666; margin-bottom: 32px; }
  .config-panel {
    background: white; border-radius: 8px; padding: 20px; margin-bottom: 24px;
    box-shadow: 0 1px 3px rgba(0,0,0,.1); max-width: 500px;
  }
  .config-panel label { display: block; font-weight: 600; margin-bottom: 4px; font-size: 14px; }
  .config-panel input { width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px; margin-bottom: 12px; font-size: 14px; }
  .config-panel button { background: #0066ff; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; }
  .config-panel button:hover { background: #0052cc; }
  .config-panel button:disabled { background: #ccc; cursor: default; }

  /* Chat widget */
  #chat-widget {
    position: fixed; bottom: 20px; right: 20px; width: 380px; height: 560px;
    background: white; border-radius: 16px; box-shadow: 0 8px 32px rgba(0,0,0,.15);
    display: none; flex-direction: column; overflow: hidden; z-index: 9999;
  }
  #chat-widget.open { display: flex; }
  #chat-header {
    background: #0066ff; color: white; padding: 16px 20px;
    display: flex; justify-content: space-between; align-items: center;
    font-weight: 600; font-size: 15px;
  }
  #chat-header button { background: none; border: none; color: white; font-size: 20px; cursor: pointer; padding: 0 4px; }
  #chat-messages {
    flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 8px;
  }
  .msg {
    max-width: 85%; padding: 10px 14px; border-radius: 12px; font-size: 14px;
    line-height: 1.5; word-wrap: break-word; white-space: pre-wrap;
  }
  .msg-user { align-self: flex-end; background: #0066ff; color: white; border-bottom-right-radius: 4px; }
  .msg-assistant { align-self: flex-start; background: #f0f0f0; color: #333; border-bottom-left-radius: 4px; }
  .msg-system { align-self: center; background: #fff3cd; color: #856404; font-size: 12px; border-radius: 8px; }
  #chat-input-area {
    padding: 12px 16px; border-top: 1px solid #eee; display: flex; gap: 8px;
  }
  #msg-input {
    flex: 1; padding: 10px 14px; border: 1px solid #ddd; border-radius: 20px;
    font-size: 14px; outline: none;
  }
  #msg-input:focus { border-color: #0066ff; }
  #send-btn {
    background: #0066ff; color: white; border: none; width: 40px; height: 40px;
    border-radius: 50%; cursor: pointer; font-size: 18px; display: flex;
    align-items: center; justify-content: center;
  }
  #send-btn:disabled { background: #ccc; }

  /* FAB */
  #chat-fab {
    position: fixed; bottom: 20px; right: 20px; width: 56px; height: 56px;
    background: #0066ff; border-radius: 50%; border: none; color: white;
    font-size: 24px; cursor: pointer; box-shadow: 0 4px 12px rgba(0,102,255,.4);
    z-index: 9998; display: none; align-items: center; justify-content: center;
  }
  #chat-fab.visible { display: flex; }

  #status-bar {
    background: #e8f5e9; padding: 8px 16px; font-size: 12px; color: #2e7d32;
    border-top: 1px solid #c8e6c9; text-align: center; display: none;
  }
  #status-bar.visible { display: block; }
  #status-bar.error { background: #ffebee; color: #c62828; border-color: #ef9a9a; }
</style>
</head>
<body>

<h1>Public Chat Widget Test</h1>
<p class="subtitle">Simula un sitio web del cliente con el widget embebido.</p>

<div class="config-panel">
  <label>API Key</label>
  <input type="text" id="api-key-input" placeholder="pk_live_...">
  <label>Base URL (opcional)</label>
  <input type="text" id="base-url-input" placeholder="Deja vacío para usar esta misma URL">
  <button id="init-btn" onclick="initWidget()">Iniciar widget</button>
</div>

<button id="chat-fab" onclick="openChat()">💬</button>

<div id="chat-widget">
  <div id="chat-header">
    <span id="agent-name">Agente</span>
    <div>
      <button onclick="clearChat()" title="Limpiar">🗑</button>
      <button onclick="closeChat()" title="Cerrar">✕</button>
    </div>
  </div>
  <div id="chat-messages"></div>
  <div id="status-bar"></div>
  <div id="chat-input-area">
    <input type="text" id="msg-input" placeholder="Escribe un mensaje..." onkeydown="if(event.key==='Enter')sendMessage()">
    <button id="send-btn" onclick="sendMessage()">➤</button>
  </div>
</div>

<script>
let API_KEY = '';
let BASE = '';
let sessionId = null;
let sessionToken = null;
let inactivityTimer = null;
let sending = false;

function initWidget() {
  API_KEY = document.getElementById('api-key-input').value.trim();
  BASE = document.getElementById('base-url-input').value.trim() || window.location.origin;
  if (!API_KEY) { alert('Ingresa un API Key'); return; }
  document.getElementById('chat-fab').classList.add('visible');
  document.getElementById('init-btn').disabled = true;
  showStatus('Widget listo. Haz click en el botón azul.');
}

async function openChat() {
  document.getElementById('chat-fab').classList.remove('visible');
  document.getElementById('chat-widget').classList.add('open');
  if (!sessionId) await createSession();
}

function closeChat() {
  destroySession();
  document.getElementById('chat-widget').classList.remove('open');
  document.getElementById('chat-fab').classList.add('visible');
}

function clearChat() {
  destroySession();
  createSession();
}

async function createSession() {
  try {
    const res = await fetch(BASE + '/api/public/chat/sessions', {
      method: 'POST',
      headers: { 'X-Api-Key': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    if (!res.ok) {
      const err = await res.json();
      showStatus('Error: ' + (err.detail || res.statusText), true);
      return;
    }
    const data = await res.json();
    sessionId = data.session_id;
    sessionToken = data.session_token;
    document.getElementById('agent-name').textContent = data.agent_name;
    document.getElementById('chat-messages').innerHTML = '';
    appendMessage('system', 'Sesión iniciada. Escribe un mensaje.');
    resetInactivityTimer();
    showStatus('Conectado — sesión ' + sessionId.slice(0, 8) + '...');
  } catch (e) {
    showStatus('Error de conexión: ' + e.message, true);
  }
}

async function sendMessage() {
  if (sending) return;
  const input = document.getElementById('msg-input');
  const content = input.value.trim();
  if (!content || !sessionId) return;

  input.value = '';
  appendMessage('user', content);
  resetInactivityTimer();
  sending = true;
  document.getElementById('send-btn').disabled = true;

  try {
    const res = await fetch(BASE + '/api/public/chat/sessions/' + sessionId + '/messages', {
      method: 'POST',
      headers: {
        'X-Session-Token': sessionToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ content })
    });

    if (!res.ok) {
      const err = await res.json();
      appendMessage('system', 'Error: ' + (err.detail || res.statusText));
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let assistantContent = '';
    const msgEl = appendMessage('assistant', '');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === 'stream') {
            assistantContent += data.content;
            msgEl.textContent = assistantContent;
            scrollToBottom();
          } else if (data.type === 'done') {
            if (!assistantContent && data.content) {
              assistantContent = data.content;
              msgEl.textContent = assistantContent;
            }
          } else if (data.type === 'error') {
            appendMessage('system', 'Error del agente: ' + data.content);
          } else if (data.type === 'timeout') {
            appendMessage('system', 'Timeout — el agente no respondió a tiempo.');
          }
        } catch (e) { /* ignore parse errors on partial chunks */ }
      }
    }

    if (!assistantContent) {
      msgEl.textContent = '(sin respuesta)';
    }
  } catch (e) {
    appendMessage('system', 'Error: ' + e.message);
  } finally {
    sending = false;
    document.getElementById('send-btn').disabled = false;
    resetInactivityTimer();
  }
}

function destroySession() {
  if (sessionId && sessionToken) {
    const body = JSON.stringify({ session_token: sessionToken });
    navigator.sendBeacon(
      BASE + '/api/public/chat/sessions/' + sessionId + '/close',
      new Blob([body], { type: 'application/json' })
    );
  }
  sessionId = null;
  sessionToken = null;
  clearTimeout(inactivityTimer);
  document.getElementById('chat-messages').innerHTML = '';
  showStatus('Sesión destruida.');
}

function resetInactivityTimer() {
  clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(() => {
    appendMessage('system', 'Sesión cerrada por inactividad (5 min).');
    destroySession();
  }, 5 * 60 * 1000);
}

function appendMessage(role, content) {
  const el = document.createElement('div');
  el.className = 'msg msg-' + role;
  el.textContent = content;
  document.getElementById('chat-messages').appendChild(el);
  scrollToBottom();
  return el;
}

function scrollToBottom() {
  const container = document.getElementById('chat-messages');
  container.scrollTop = container.scrollHeight;
}

function showStatus(text, isError) {
  const bar = document.getElementById('status-bar');
  bar.textContent = text;
  bar.className = 'visible' + (isError ? ' error' : '');
}

window.addEventListener('beforeunload', destroySession);
</script>
</body>
</html>"""


@router.get("/public-chat-test")
async def test_page():
    return HTMLResponse(content=TEST_PAGE_HTML)
