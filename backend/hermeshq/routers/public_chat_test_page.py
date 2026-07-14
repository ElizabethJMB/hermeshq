"""Test page for the public chat widget. Admin-only."""
from fastapi import APIRouter, Depends
from fastapi.responses import HTMLResponse

from hermeshq.core.security import require_admin
from hermeshq.models.user import User

router = APIRouter(tags=["public-chat-test"])

TEST_PAGE_HTML = """<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Public Chat Widget — Test</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: system-ui, -apple-system, sans-serif;
    background: #f0f2f5; color: #333;
    display: flex; align-items: center; justify-content: center;
    min-height: 100vh; padding: 20px;
  }
  .card {
    background: #fff; border-radius: 16px; padding: 32px;
    box-shadow: 0 2px 12px rgba(0,0,0,.08); max-width: 480px; width: 100%;
  }
  h1 { font-size: 20px; margin-bottom: 4px; }
  .subtitle { color: #888; font-size: 14px; margin-bottom: 24px; }
  label { display: block; font-weight: 600; font-size: 13px; margin-bottom: 4px; color: #555; }
  input {
    width: 100%; padding: 10px 14px; border: 1px solid #ddd; border-radius: 10px;
    margin-bottom: 16px; font-size: 14px; outline: none; transition: border .2s;
  }
  input:focus { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,.15); }
  .row { display: flex; gap: 12px; margin-bottom: 16px; }
  .row input { margin-bottom: 0; }
  select {
    width: 100%; padding: 10px 14px; border: 1px solid #ddd; border-radius: 10px;
    font-size: 14px; outline: none; background: #fff; cursor: pointer;
  }
  button {
    width: 100%; padding: 12px; background: #6366f1; color: #fff; border: none;
    border-radius: 10px; font-size: 15px; font-weight: 600; cursor: pointer;
    transition: background .2s;
  }
  button:hover { background: #4f46e5; }
  button:disabled { background: #ccc; cursor: default; }
  .status {
    margin-top: 16px; padding: 10px 14px; border-radius: 10px;
    font-size: 13px; display: none; text-align: center;
  }
  .status.visible { display: block; }
  .status.ok { background: #ecfdf5; color: #065f46; }
  .status.err { background: #fef2f2; color: #991b1b; }
</style>
</head>
<body>
<div class="card">
  <h1>Public Chat Widget</h1>
  <p class="subtitle">Test the embeddable chat widget.</p>

  <label for="key">API Key</label>
  <input type="text" id="key" placeholder="pk_live_...">

  <div class="row">
    <div style="flex:1">
      <label for="theme">Theme</label>
      <select id="theme">
        <option value="auto">Auto (system)</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </div>
    <div style="flex:1">
      <label for="accent">Accent color</label>
      <input type="color" id="accent" value="#6366f1" style="height:42px;padding:4px;">
    </div>
  </div>

  <label for="title">Widget title (optional)</label>
  <input type="text" id="title" placeholder="My AI Assistant">

  <button id="load-btn">Load Widget</button>
  <div class="status" id="status"></div>
</div>

<script>
document.getElementById('load-btn').addEventListener('click', function() {
  var key = document.getElementById('key').value.trim();
  if (!key) { showStatus('Enter an API key.', true); return; }

  var existing = document.getElementById('hermeshq-widget-script');
  if (existing) existing.remove();
  var host = document.getElementById('hermeshq-chat-widget');
  if (host) host.remove();

  var s = document.createElement('script');
  s.id = 'hermeshq-widget-script';
  s.src = '/api/public/chat/widget.js';
  s.setAttribute('data-api-key', key);
  s.setAttribute('data-theme', document.getElementById('theme').value);
  s.setAttribute('data-accent-color', document.getElementById('accent').value);
  var title = document.getElementById('title').value.trim();
  if (title) s.setAttribute('data-title', title);
  document.body.appendChild(s);

  this.disabled = true;
  showStatus('Widget loaded. Click the chat bubble.', false);
});

function showStatus(msg, isErr) {
  var el = document.getElementById('status');
  el.textContent = msg;
  el.className = 'status visible ' + (isErr ? 'err' : 'ok');
}
</script>
</body>
</html>"""


@router.get("/public-chat-test")
async def test_page(current_user: User = Depends(require_admin)):
    return HTMLResponse(content=TEST_PAGE_HTML)
