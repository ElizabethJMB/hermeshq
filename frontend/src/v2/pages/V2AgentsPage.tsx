import { FormEvent, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useAgents, useAgentAction, useCreateAgent } from "../../api/agents";
import { AgentAvatar } from "../../components/AgentAvatar";
import { useNodes } from "../../api/nodes";
import { useProviders } from "../../api/providers";
import { useSecrets } from "../../api/secrets";
import { useSessionStore } from "../../stores/sessionStore";
import { v2toast, extractErrorMessage } from "../toast";

function statusTone(status: string): "success" | "error" | "warn" | "neutral" {
  if (status === "running") return "success";
  if (status === "error") return "error";
  if (status === "starting" || status === "paused") return "warn";
  return "neutral";
}

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || `agent-${Date.now()}`;
}

export function V2AgentsPage() {
  const { data: agents, isLoading } = useAgents();
  const { data: nodes } = useNodes();
  const { data: providers } = useProviders();
  const { data: secrets } = useSecrets();
  const startAgent = useAgentAction("start");
  const stopAgent = useAgentAction("stop");
  const createAgent = useCreateAgent();
  const currentUser = useSessionStore((state) => state.user);
  const isAdmin = currentUser?.role === "admin";

  const [filter, setFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [friendlyName, setFriendlyName] = useState("");
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [apiKeyRef, setApiKeyRef] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");

  const filtered = useMemo(() => {
    const list = agents ?? [];
    if (!filter.trim()) return list;
    const q = filter.toLowerCase();
    return list.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        (a.friendly_name ?? "").toLowerCase().includes(q) ||
        (a.model ?? "").toLowerCase().includes(q) ||
        a.status.toLowerCase().includes(q),
    );
  }, [agents, filter]);

  const selectedProvider = useMemo(
    () => (providers ?? []).find((p) => p.runtime_provider === provider || p.slug === provider),
    [providers, provider],
  );

  const providerSecrets = useMemo(
    () => (secrets ?? []).filter((s) => !selectedProvider || !s.provider || s.provider === selectedProvider.slug),
    [secrets, selectedProvider],
  );

  function resetCreateForm() {
    setFriendlyName("");
    setProvider("");
    setModel("");
    setApiKeyRef("");
    setBaseUrl("");
    setSystemPrompt("");
    setCreateError(null);
  }

  async function onCreateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateError(null);
    const nodeId = nodes?.[0]?.id;
    if (!nodeId) {
      setCreateError("No compute node available");
      return;
    }
    const name = friendlyName.trim();
    if (!name) {
      setCreateError("Name is required");
      return;
    }
    try {
      const payload: Record<string, unknown> = {
        node_id: nodeId,
        friendly_name: name,
        name,
        slug: slugify(name),
        run_mode: "hybrid",
        runtime_profile: "standard",
        use_provider_default: !provider,
      };
      if (provider) {
        payload.provider = provider;
        payload.model = model || selectedProvider?.default_model || null;
        payload.api_key_ref = apiKeyRef || null;
        payload.base_url = baseUrl || selectedProvider?.base_url || null;
      }
      if (systemPrompt.trim()) {
        payload.system_prompt = systemPrompt.trim();
      }
      const created = await createAgent.mutateAsync(payload);
      v2toast.success(`Agent "${name}" created`);
      resetCreateForm();
      setShowCreate(false);
      window.location.href = `/v2/agents/${created.id}`;
    } catch (error) {
      setCreateError(extractErrorMessage(error, "Agent creation failed"));
    }
  }

  async function handleStart(agentId: string, name: string) {
    try {
      await startAgent.mutateAsync(agentId);
      v2toast.success(`${name} started`);
    } catch (error) {
      v2toast.error(extractErrorMessage(error, `Failed to start ${name}`));
    }
  }

  async function handleStop(agentId: string, name: string) {
    try {
      await stopAgent.mutateAsync(agentId);
      v2toast.success(`${name} stopped`);
    } catch (error) {
      v2toast.error(extractErrorMessage(error, `Failed to stop ${name}`));
    }
  }

  return (
    <div>
      <div className="v2-page-header">
        <div>
          <h1 className="v2-page-title">Agents</h1>
          <p className="v2-page-subtitle">{(agents ?? []).length} agents configured</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input
            className="v2-input"
            style={{ width: 240 }}
            placeholder="Filter by name, model, status…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          {isAdmin ? (
            <button className="v2-btn v2-btn-primary" onClick={() => setShowCreate((v) => !v)}>
              {showCreate ? "Close" : "New agent"}
            </button>
          ) : null}
        </div>
      </div>

      {showCreate && isAdmin ? (
        <form className="v2-card v2-section" onSubmit={onCreateSubmit}>
          <div className="v2-card-header">
            <h2 className="v2-card-title">Create agent</h2>
            <Link to="/builder" className="v2-btn v2-btn-ghost" style={{ fontSize: 12 }}>
              Prefer the AI Builder? ✨
            </Link>
          </div>
          <div className="v2-card-body" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div className="v2-field">
                <label className="v2-field-label">Name *</label>
                <input className="v2-input" value={friendlyName} onChange={(e) => setFriendlyName(e.target.value)} required placeholder="e.g. Support Agent" autoFocus />
                <span className="v2-field-hint">Slug: {friendlyName.trim() ? slugify(friendlyName) : "—"}</span>
              </div>
              <div className="v2-field">
                <label className="v2-field-label">Provider preset</label>
                <select
                  className="v2-select"
                  value={provider}
                  onChange={(e) => {
                    setProvider(e.target.value);
                    const p = (providers ?? []).find((pr) => pr.runtime_provider === e.target.value || pr.slug === e.target.value);
                    if (p?.default_model) setModel(p.default_model);
                    if (p?.base_url) setBaseUrl(p.base_url);
                  }}
                >
                  <option value="">Use instance default</option>
                  {(providers ?? []).filter((p) => p.enabled).map((p) => (
                    <option key={p.slug} value={p.runtime_provider}>{p.name}</option>
                  ))}
                </select>
              </div>
              {provider ? (
                <div className="v2-field">
                  <label className="v2-field-label">Model</label>
                  {selectedProvider?.available_models?.length ? (
                    <select className="v2-select" value={model} onChange={(e) => setModel(e.target.value)}>
                      {selectedProvider.available_models.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  ) : (
                    <input className="v2-input" value={model} onChange={(e) => setModel(e.target.value)} placeholder={selectedProvider?.default_model ?? "model-id"} />
                  )}
                </div>
              ) : null}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {provider ? (
                <>
                  <div className="v2-field">
                    <label className="v2-field-label">API key (secret)</label>
                    <select className="v2-select" value={apiKeyRef} onChange={(e) => setApiKeyRef(e.target.value)}>
                      <option value="">None</option>
                      {providerSecrets.map((s) => (
                        <option key={s.name} value={s.name}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="v2-field">
                    <label className="v2-field-label">Base URL</label>
                    <input className="v2-input" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={selectedProvider?.base_url ?? "https://api.example.com/v1"} />
                  </div>
                </>
              ) : null}
              <details className="v2-details">
                <summary>Advanced</summary>
                <div className="v2-details-body" style={{ paddingTop: 14 }}>
                  <div className="v2-field">
                    <label className="v2-field-label">System prompt</label>
                    <textarea className="v2-textarea" rows={5} value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} placeholder="Custom instructions for this agent (optional)" />
                  </div>
                </div>
              </details>
              {createError ? <p className="v2-field-error">{createError}</p> : null}
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button type="submit" className="v2-btn v2-btn-primary" disabled={createAgent.isPending}>
                  {createAgent.isPending ? "Creating…" : "Create agent"}
                </button>
                <button type="button" className="v2-btn v2-btn-secondary" onClick={() => { resetCreateForm(); setShowCreate(false); }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </form>
      ) : null}

      <section className="v2-card">
        {isLoading ? (
          <div style={{ padding: 20 }}>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="v2-skeleton" style={{ height: 56, marginBottom: 8 }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="v2-empty">
            <p className="v2-empty-title">{filter ? "No agents match your filter" : "No agents yet"}</p>
            <p className="v2-empty-text">
              {filter ? "Try a different search." : "Create your first agent to get started."}
            </p>
            {!filter && isAdmin ? (
              <div className="v2-empty-action">
                <button className="v2-btn v2-btn-primary" onClick={() => setShowCreate(true)}>Create agent</button>
              </div>
            ) : null}
          </div>
        ) : (
          filtered.map((agent) => {
            const name = agent.friendly_name || agent.name;
            const isRunning = agent.status === "running";
            return (
              <div key={agent.id} className="v2-agent-row">
                <Link to={`/v2/agents/${agent.id}`} style={{ display: "flex", alignItems: "center", gap: 14, flex: 1, textDecoration: "none", color: "inherit", minWidth: 0 }}>
                  <AgentAvatar agent={agent} sizeClass="h-9 w-9" roundedClass="rounded-lg" />
                  <div style={{ minWidth: 0 }}>
                    <div className="v2-agent-name">{name}</div>
                    <div className="v2-agent-meta">
                      {agent.model ?? agent.provider} · {agent.slug}
                    </div>
                  </div>
                </Link>
                <span className="v2-pill" data-tone={statusTone(agent.status)}>
                  <span className="v2-pill-dot" />
                  {agent.status}
                </span>
                {isRunning ? (
                  <button className="v2-btn v2-btn-secondary" style={{ padding: "6px 12px", fontSize: 12.5 }} disabled={stopAgent.isPending} onClick={() => void handleStop(agent.id, name)}>
                    Stop
                  </button>
                ) : (
                  <button className="v2-btn v2-btn-secondary" style={{ padding: "6px 12px", fontSize: 12.5 }} disabled={startAgent.isPending} onClick={() => void handleStart(agent.id, name)}>
                    Start
                  </button>
                )}
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
