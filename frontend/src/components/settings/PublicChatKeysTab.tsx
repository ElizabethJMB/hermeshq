import { useState, type FormEvent } from "react";
import type { UseMutationResult } from "@tanstack/react-query";
import { useI18n } from "../../lib/i18n";
import type { Agent, PublicChatApiKey, PublicChatApiKeyCreated } from "../../types/api";

interface PublicChatKeysTabProps {
  agents: Agent[] | undefined;
  publicChatKeys: PublicChatApiKey[] | undefined;
  createPublicChatKey: UseMutationResult<PublicChatApiKeyCreated, Error, Record<string, unknown>>;
  deletePublicChatKey: UseMutationResult<string, Error, string>;
}

export default function PublicChatKeysTab({
  agents,
  publicChatKeys,
  createPublicChatKey,
  deletePublicChatKey,
}: PublicChatKeysTabProps) {
  const { t } = useI18n();

  const [label, setLabel] = useState("");
  const [agentId, setAgentId] = useState("");
  const [allowedDomains, setAllowedDomains] = useState("*");
  const [requestsPerMonth, setRequestsPerMonth] = useState(1000);
  const [tokensPerMonth, setTokensPerMonth] = useState(100_000);
  const [lastCreatedKey, setLastCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [snippetCopied, setSnippetCopied] = useState(false);

  // Widget appearance
  const [widgetTitle, setWidgetTitle] = useState("");
  const [widgetTheme, setWidgetTheme] = useState<"auto" | "light" | "dark">("auto");
  const [widgetAccent, setWidgetAccent] = useState("#6366f1");
  const [widgetPosition, setWidgetPosition] = useState<"right" | "left">("right");

  const activeAgents = (agents ?? []).filter((a) => !a.is_archived);
  const selectedAgent = activeAgents.find((a) => a.id === agentId);

  function buildSnippet(apiKey: string): string {
    const attrs = [
      `  src="${window.location.origin}/api/public/chat/widget.js"`,
      `  data-api-key="${apiKey}"`,
    ];
    if (widgetTitle.trim()) attrs.push(`  data-title="${widgetTitle.trim()}"`);
    if (widgetTheme !== "auto") attrs.push(`  data-theme="${widgetTheme}"`);
    if (widgetAccent !== "#6366f1") attrs.push(`  data-accent-color="${widgetAccent}"`);
    if (widgetPosition !== "right") attrs.push(`  data-position="${widgetPosition}"`);
    return `<script\n${attrs.join("\n")}>\n</script>`;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const domains = allowedDomains
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean);
    const result = await createPublicChatKey.mutateAsync({
      label: label.trim(),
      agent_id: agentId,
      allowed_domains: domains,
      requests_per_month: requestsPerMonth,
      tokens_per_month: tokensPerMonth,
    });
    setLastCreatedKey(result.raw_key);
    setCopied(false);
    setSnippetCopied(false);
    setLabel("");
    setAgentId("");
    setAllowedDomains("*");
    setRequestsPerMonth(1000);
    setTokensPerMonth(100_000);
  }

  function copyKey() {
    if (!lastCreatedKey) return;
    navigator.clipboard.writeText(lastCreatedKey);
    setCopied(true);
  }

  function copySnippet() {
    if (!lastCreatedKey) return;
    navigator.clipboard.writeText(buildSnippet(lastCreatedKey));
    setSnippetCopied(true);
  }

  function agentDisplayName(id: string): string {
    const agent = (agents ?? []).find((a) => a.id === id);
    if (!agent) return id;
    return agent.friendly_name || agent.name || agent.slug;
  }

  const selectClass = "w-full rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2.5 text-sm text-[var(--text-display)] outline-none";

  return (
    <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <div className="space-y-6">
        {/* API Key creation form */}
        <form className="panel-frame p-6" onSubmit={handleSubmit}>
          <p className="panel-label">Widget API</p>
          <h2 className="mt-2 text-2xl text-[var(--text-display)]">Create API key</h2>
          <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
            Generate a key to embed the chat widget on an external website. The key is shown once after creation.
          </p>
          <div className="mt-6 space-y-4">
            <label className="panel-field">
              <span className="panel-label">Label</span>
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Website chat — acme.com" />
            </label>
            <label className="panel-field">
              <span className="panel-label">Agent</span>
              <select value={agentId} onChange={(e) => setAgentId(e.target.value)} className={selectClass}>
                <option value="">Select an agent…</option>
                {activeAgents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.friendly_name || agent.name || agent.slug} · {agent.status}
                  </option>
                ))}
              </select>
            </label>
            <label className="panel-field">
              <span className="panel-label">Allowed domains</span>
              <input value={allowedDomains} onChange={(e) => setAllowedDomains(e.target.value)} placeholder="*, example.com, app.example.com" />
              <span className="mt-1 block text-xs text-[var(--text-secondary)]">Comma-separated. Use * to allow any domain.</span>
            </label>
            <div className="grid grid-cols-2 gap-4">
              <label className="panel-field">
                <span className="panel-label">Requests / month</span>
                <input type="number" min={1} value={requestsPerMonth} onChange={(e) => setRequestsPerMonth(Number(e.target.value))} />
              </label>
              <label className="panel-field">
                <span className="panel-label">Tokens / month</span>
                <input type="number" min={1} value={tokensPerMonth} onChange={(e) => setTokensPerMonth(Number(e.target.value))} />
              </label>
            </div>
            <button
              className="panel-button-primary w-full"
              type="submit"
              disabled={createPublicChatKey.isPending || !label.trim() || !agentId}
            >
              {createPublicChatKey.isPending ? "Creating…" : "Create API key"}
            </button>
            {lastCreatedKey ? (
              <div className="rounded-2xl border border-[var(--warning)]/40 bg-[var(--surface-raised)] p-4">
                <p className="panel-label">Key shown once</p>
                <div className="mt-2 flex items-start gap-2">
                  <p className="min-w-0 flex-1 break-all font-mono text-xs text-[var(--text-display)]">{lastCreatedKey}</p>
                  <button type="button" className="panel-button-secondary flex-shrink-0 !px-3 !py-1.5 text-xs" onClick={copyKey}>
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
                <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-3">
                  <p className="text-xs font-medium text-[var(--text-secondary)]">Embed snippet</p>
                  <pre className="mt-1.5 whitespace-pre-wrap break-all text-[11px] leading-5 text-[var(--text-display)]">{buildSnippet(lastCreatedKey)}</pre>
                  <button type="button" className="panel-button-secondary mt-2 text-xs" onClick={copySnippet}>
                    {snippetCopied ? "Copied!" : "Copy snippet"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </form>

        {/* Widget appearance */}
        <div className="panel-frame p-6">
          <p className="panel-label">Appearance</p>
          <h2 className="mt-2 text-2xl text-[var(--text-display)]">Widget customization</h2>
          <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
            Customize how the chat widget looks on your site. These settings are included in the embed snippet above.
          </p>
          <div className="mt-6 space-y-4">
            <label className="panel-field">
              <span className="panel-label">Title</span>
              <input value={widgetTitle} onChange={(e) => setWidgetTitle(e.target.value)} placeholder="My AI Assistant" />
              <span className="mt-1 block text-xs text-[var(--text-secondary)]">Shown in the widget header. Defaults to the agent name.</span>
            </label>
            <div className="grid grid-cols-2 gap-4">
              <label className="panel-field">
                <span className="panel-label">Theme</span>
                <select value={widgetTheme} onChange={(e) => setWidgetTheme(e.target.value as "auto" | "light" | "dark")} className={selectClass}>
                  <option value="auto">Auto (system)</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </label>
              <label className="panel-field">
                <span className="panel-label">Position</span>
                <select value={widgetPosition} onChange={(e) => setWidgetPosition(e.target.value as "right" | "left")} className={selectClass}>
                  <option value="right">Bottom right</option>
                  <option value="left">Bottom left</option>
                </select>
              </label>
            </div>
            <label className="panel-field">
              <span className="panel-label">Accent color</span>
              <div className="mt-1 flex items-center gap-3">
                <input
                  type="color"
                  value={widgetAccent}
                  onChange={(e) => setWidgetAccent(e.target.value)}
                  className="h-10 w-14 cursor-pointer rounded-lg border border-[var(--border)] bg-transparent p-1"
                />
                <input
                  value={widgetAccent}
                  onChange={(e) => setWidgetAccent(e.target.value)}
                  className="w-28 font-mono text-sm"
                  maxLength={7}
                />
                <span
                  className="flex h-10 items-center rounded-xl px-4 text-xs font-medium text-white"
                  style={{ background: widgetAccent }}
                >
                  Preview
                </span>
              </div>
            </label>
          </div>

          {/* Live preview */}
          <div className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-4">
            <p className="panel-label mb-3">Preview</p>
            <div className={`overflow-hidden rounded-2xl ${widgetTheme === "dark" || (widgetTheme === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "bg-[#1c1f2e]" : "bg-white shadow-sm"}`} style={{ maxWidth: 320 }}>
              <div className="flex items-center gap-2.5 px-4 py-3 text-white" style={{ background: widgetAccent }}>
                <span className="flex h-8 w-8 items-center justify-content rounded-full text-sm" style={{ background: "rgba(255,255,255,.18)" }}>🤖</span>
                <div>
                  <p className="text-sm font-semibold">{widgetTitle.trim() || selectedAgent?.friendly_name || selectedAgent?.name || "Assistant"}</p>
                  <p className="flex items-center gap-1 text-[10px] opacity-75"><span className="inline-block h-1.5 w-1.5 rounded-full bg-green-400" /> Online</p>
                </div>
              </div>
              <div className={`space-y-2 px-4 py-3 ${widgetTheme === "dark" || (widgetTheme === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "bg-[#171a27]" : "bg-[#f7f8fa]"}`}>
                <p className={`w-fit rounded-2xl rounded-bl-md px-3 py-2 text-xs ${widgetTheme === "dark" || (widgetTheme === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "bg-[#242839] text-[#e1e3ea]" : "bg-white text-[#1a1d23] shadow-sm"}`}>
                  How can I help you?
                </p>
                <p className="ml-auto w-fit rounded-2xl rounded-br-md px-3 py-2 text-xs text-white" style={{ background: widgetAccent }}>
                  Hello!
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <section className="panel-frame p-6">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--border)] pb-4">
          <div>
            <p className="panel-label">Active keys</p>
            <h2 className="mt-2 text-2xl text-[var(--text-display)]">API key registry</h2>
          </div>
          <p className="panel-label">{publicChatKeys?.length ?? 0} keys</p>
        </div>
        <div className="mt-5 space-y-4">
          {(publicChatKeys ?? []).map((key) => (
            <article key={key.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="panel-label">{agentDisplayName(key.agent_id)}</p>
                  <h3 className="mt-1 text-lg text-[var(--text-display)]">{key.label}</h3>
                </div>
                <span className={`rounded-full border px-3 py-1 text-xs ${key.is_active ? "border-[var(--success)]/40 text-[var(--success)]" : "border-[var(--danger)]/40 text-[var(--danger)]"}`}>
                  {key.is_active ? "active" : "inactive"}
                </span>
              </div>
              <div className="mt-4 grid gap-3 text-sm text-[var(--text-secondary)] sm:grid-cols-2">
                <p><strong>Prefix:</strong> <span className="font-mono">{key.key_prefix}</span></p>
                <p><strong>Domains:</strong> {key.allowed_domains.length ? key.allowed_domains.join(", ") : "any"}</p>
                <p><strong>Requests/mo:</strong> {key.requests_per_month.toLocaleString()}</p>
                <p><strong>Tokens/mo:</strong> {key.tokens_per_month.toLocaleString()}</p>
                <p><strong>Created:</strong> {new Date(key.created_at).toLocaleDateString()}</p>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  className="panel-button-secondary"
                  onClick={() => {
                    if (window.confirm(`Deactivate API key "${key.label}"?`)) {
                      void deletePublicChatKey.mutateAsync(key.id);
                    }
                  }}
                >
                  Deactivate
                </button>
              </div>
            </article>
          ))}
          {!publicChatKeys?.length ? (
            <p className="text-sm text-[var(--text-secondary)]">No API keys have been created yet.</p>
          ) : null}
        </div>
      </section>
    </section>
  );
}
