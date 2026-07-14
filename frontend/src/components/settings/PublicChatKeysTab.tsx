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

  const activeAgents = (agents ?? []).filter((a) => !a.is_archived);
  const selectedAgent = activeAgents.find((a) => a.id === agentId);

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
    const snippet = `<script src="${window.location.origin}/api/public/chat/widget.js" data-api-key="${lastCreatedKey}"></script>`;
    navigator.clipboard.writeText(snippet);
  }

  function agentDisplayName(id: string): string {
    const agent = (agents ?? []).find((a) => a.id === id);
    if (!agent) return id;
    return agent.friendly_name || agent.name || agent.slug;
  }

  return (
    <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
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
            <select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2.5 text-sm text-[var(--text-display)] outline-none"
            >
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
                <button
                  type="button"
                  className="panel-button-secondary flex-shrink-0 !px-3 !py-1.5 text-xs"
                  onClick={copyKey}
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
              <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-3">
                <p className="text-xs font-medium text-[var(--text-secondary)]">Embed snippet</p>
                <pre className="mt-1.5 whitespace-pre-wrap break-all text-[11px] leading-5 text-[var(--text-display)]">{`<script\n  src="${window.location.origin}/api/public/chat/widget.js"\n  data-api-key="${lastCreatedKey}">\n</script>`}</pre>
                <button
                  type="button"
                  className="panel-button-secondary mt-2 text-xs"
                  onClick={copySnippet}
                >
                  Copy snippet
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </form>

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
