import { useState, useEffect } from "react";
import { useSettings, useUpdateSettings } from "../../api/settings";
import { useSecrets } from "../../api/secrets";
import { useSessionStore } from "../../stores/sessionStore";

export function TeamsTab() {
  const { data: settings, isLoading } = useSettings();
  const updateSettings = useUpdateSettings();
  const currentUser = useSessionStore((state) => state.user);
  const isAdmin = currentUser?.role === "admin";
  const { data: secrets } = useSecrets(isAdmin);

  const [botUrl, setBotUrl] = useState("");
  const [adminKeyRef, setAdminKeyRef] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settings) {
      setBotUrl(settings.teams_bot_url ?? "");
      setAdminKeyRef(settings.teams_bot_admin_key_ref ?? "");
    }
  }, [settings]);

  async function handleSave() {
    await updateSettings.mutateAsync({
      teams_bot_url: botUrl || null,
      teams_bot_admin_key_ref: adminKeyRef || null,
    } as Parameters<typeof updateSettings.mutateAsync>[0]);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  const secretOptions = (secrets ?? []).map((s) => String(s.name ?? "")).filter(Boolean).sort();

  if (isLoading) {
    return <p className="text-sm text-[var(--text-secondary)]">Cargando...</p>;
  }

  return (
    <div className="grid gap-6">
      <article className="panel-frame p-6">
        <p className="panel-label">Microsoft Teams — Bot Relay</p>
        <h3 className="mt-2 text-xl text-[var(--text-display)]">Configuración global del bot</h3>
        <p className="mt-2 max-w-[48rem] text-sm leading-6 text-[var(--text-secondary)]">
          Configura la URL del bot relay de Teams y la clave de administración.
          Estos valores se usan para provisionar tokens por agente desde el panel de canales.
          La Admin Key debe estar guardada como secreto en Settings → Secrets.
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <label className="panel-field">
            <span className="panel-label">Bot URL</span>
            <input
              type="url"
              value={botUrl}
              onChange={(e) => setBotUrl(e.target.value)}
              placeholder="https://teams-bot.mycompany.com"
              className="font-mono text-sm"
            />
          </label>

          <label className="panel-field">
            <span className="panel-label">Admin Key (secreto)</span>
            <select
              value={adminKeyRef}
              onChange={(e) => setAdminKeyRef(e.target.value)}
              className="font-mono text-sm"
            >
              <option value="">— sin seleccionar —</option>
              {secretOptions.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </label>
        </div>

        <p className="mt-4 text-xs text-[var(--text-secondary)]">
          La Admin Key es la clave maestra del bot relay (equivalente a la que usa{" "}
          <code>manage_tokens.py</code>). Guárdala primero como secreto y referencíala aquí.
        </p>

        <div className="mt-6 flex items-center gap-4">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void handleSave()}
            disabled={updateSettings.isPending}
          >
            {updateSettings.isPending ? "Guardando..." : "Guardar"}
          </button>
          {saved && (
            <span className="text-sm text-[var(--text-secondary)]">✓ Guardado</span>
          )}
        </div>
      </article>

      <article className="panel-frame p-6">
        <p className="panel-label">Flujo de configuración por agente</p>
        <ol className="mt-4 space-y-2 text-sm leading-6 text-[var(--text-secondary)] list-decimal list-inside">
          <li>Guarda la Admin Key del bot relay como secreto en <strong>Settings → Secrets</strong></li>
          <li>Configura la Bot URL y selecciona la Admin Key aquí</li>
          <li>En cada agente → <strong>Canal Teams</strong> → botón <strong>"Provisionar token"</strong></li>
          <li>El token queda guardado automáticamente y el canal queda listo para activar</li>
          <li>Los usuarios de Teams se vinculan automáticamente por email corporativo en su primer mensaje</li>
        </ol>
      </article>
    </div>
  );
}
