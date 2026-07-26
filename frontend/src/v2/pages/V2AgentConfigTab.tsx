import { useState } from "react";
import { Link } from "react-router-dom";

import type { Agent, ProviderDefinition, Secret, HermesVersion, AuxiliaryModelEntry } from "../../types/api";
import type { UseMutationResult } from "@tanstack/react-query";
import type { AppSettings } from "../../types/api";
import { v2toast, extractErrorMessage } from "../toast";

function saveField(
  updateAgent: UseMutationResult<Agent, Error, { agentId: string; payload: Record<string, unknown> }>,
  agentId: string,
  field: string,
  value: unknown,
) {
  updateAgent
    .mutateAsync({ agentId, payload: { [field]: value } })
    .then(() => v2toast.success("Saved"))
    .catch((error) => v2toast.error(extractErrorMessage(error, "Save failed")));
}

export function V2AgentConfigTab({
  agent,
  isAdmin,
  providers,
  secrets,
  hermesVersions,
  updateAgent,
}: {
  agent: Agent;
  isAdmin: boolean;
  providers: ProviderDefinition[];
  secrets: Secret[];
  hermesVersions: HermesVersion[];
  updateAgent: UseMutationResult<Agent, Error, { agentId: string; payload: Record<string, unknown> }>;
}) {
  const agentProvider =
    providers.find((p) => p.runtime_provider === agent.provider && (p.available_models ?? []).length > 0) ??
    providers.find((p) => p.slug === agent.provider);
  const availableModels = agentProvider?.available_models ?? [];

  const [useProviderDefault, setUseProviderDefault] = useState(agent.use_provider_default);
  const [customModel, setCustomModel] = useState(agent.model ?? "");
  const [apiKeyRef, setApiKeyRef] = useState(agent.api_key_ref ?? "");
  const [baseUrl, setBaseUrl] = useState(agent.base_url ?? "");
  const [systemPrompt, setSystemPrompt] = useState(agent.system_prompt ?? "");
  const [friendlyName, setFriendlyName] = useState(agent.friendly_name ?? "");
  const [approvalMode, setApprovalMode] = useState(agent.approval_mode ?? "inherit");
  const [toolProgressMode, setToolProgressMode] = useState(agent.tool_progress_mode ?? "inherit");
  const [gatewayNotifMode, setGatewayNotifMode] = useState(agent.gateway_notifications_mode ?? "inherit");
  const [runtimeProfile, setRuntimeProfile] = useState(agent.runtime_profile ?? "standard");
  const [hermesVersion, setHermesVersion] = useState(agent.hermes_version || "");
  const [fbProvider, setFbProvider] = useState(agent.fallback_provider ?? "");
  const [fbModel, setFbModel] = useState(agent.fallback_model ?? "");
  const [fbKeyRef, setFbKeyRef] = useState(agent.fallback_api_key_ref ?? "");
  const [fbBaseUrl, setFbBaseUrl] = useState(agent.fallback_base_url ?? "");
  const [auxDraft, setAuxDraft] = useState<Record<string, AuxiliaryModelEntry>>(
    agent.auxiliary_models ?? {},
  );
  const AUX_TASKS = [
    { key: "vision", label: "Vision" },
    { key: "compression", label: "Compression" },
    { key: "web_extract", label: "Web extract" },
  ];

  const fbProviderDef = providers.find((p) => p.runtime_provider === fbProvider && (p.available_models ?? []).length > 0);

  function saveRuntimeConfig() {
    const payload: Record<string, unknown> = {
      friendly_name: friendlyName,
      use_provider_default: useProviderDefault,
      api_key_ref: apiKeyRef || null,
      base_url: baseUrl || null,
      system_prompt: systemPrompt || null,
      approval_mode: approvalMode,
      tool_progress_mode: toolProgressMode,
      gateway_notifications_mode: gatewayNotifMode,
      runtime_profile: runtimeProfile,
      hermes_version: hermesVersion || null,
      fallback_provider: fbProvider || null,
      fallback_model: fbModel || null,
      fallback_api_key_ref: fbKeyRef || null,
      fallback_base_url: fbBaseUrl || null,
      auxiliary_models: Object.keys(auxDraft).length > 0 ? auxDraft : null,
    };
    if (!useProviderDefault) payload.model = customModel || null;
    updateAgent
      .mutateAsync({ agentId: agent.id, payload })
      .then(() => v2toast.success("Runtime config saved"))
      .catch((error) => v2toast.error(extractErrorMessage(error, "Save failed")));
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>
      <section className="v2-card">
        <div className="v2-card-header"><h2 className="v2-card-title">Identity</h2></div>
        <div className="v2-card-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="v2-field">
            <label className="v2-field-label">Friendly name</label>
            <input className="v2-input" value={friendlyName} onChange={(e) => setFriendlyName(e.target.value)} disabled={!isAdmin} />
          </div>
          <div className="v2-field">
            <label className="v2-field-label">Slug</label>
            <input className="v2-input v2-mono" value={agent.slug} disabled />
          </div>
          <div className="v2-field">
            <label className="v2-field-label">Description</label>
            <input className="v2-input" defaultValue={agent.description ?? ""} disabled={!isAdmin}
              onBlur={(e) => isAdmin && saveField(updateAgent, agent.id, "description", e.target.value || null)} />
          </div>
        </div>
      </section>

      <section className="v2-card">
        <div className="v2-card-header"><h2 className="v2-card-title">Model & Provider</h2></div>
        <div className="v2-card-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="v2-field">
            <label className="v2-field-label">Provider</label>
            <div className="v2-mono" style={{ fontSize: 13, padding: "8px 0" }}>
              {agentProvider?.name ?? agent.provider} <span style={{ color: "var(--v2-text-muted)" }}>({agent.provider})</span>
            </div>
          </div>
          <div className="v2-field">
            <label className="v2-field-label">Use provider default model</label>
            <select className="v2-select" value={useProviderDefault ? "true" : "false"} onChange={(e) => setUseProviderDefault(e.target.value === "true")} disabled={!isAdmin}>
              <option value="true">Yes</option>
              <option value="false">No — choose custom model</option>
            </select>
          </div>
          {!useProviderDefault ? (
            <div className="v2-field">
              <label className="v2-field-label">Model</label>
              {availableModels.length > 0 ? (
                <select className="v2-select" value={customModel} onChange={(e) => setCustomModel(e.target.value)} disabled={!isAdmin}>
                  {!availableModels.includes(customModel) && customModel ? <option value={customModel}>{customModel} (current)</option> : null}
                  {availableModels.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              ) : (
                <input className="v2-input" value={customModel} onChange={(e) => setCustomModel(e.target.value)} disabled={!isAdmin} />
              )}
            </div>
          ) : null}
          <div className="v2-field">
            <label className="v2-field-label">API key (secret)</label>
            <select className="v2-select" value={apiKeyRef} onChange={(e) => setApiKeyRef(e.target.value)} disabled={!isAdmin}>
              <option value="">None</option>
              {secrets.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
            </select>
          </div>
          <div className="v2-field">
            <label className="v2-field-label">Base URL</label>
            <input className="v2-input v2-mono" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} disabled={!isAdmin}
              placeholder={agentProvider?.base_url ?? "https://api.example.com/v1"} />
          </div>
        </div>
      </section>

      <section className="v2-card">
        <div className="v2-card-header"><h2 className="v2-card-title">System prompt</h2></div>
        <div className="v2-card-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="v2-field">
            <label className="v2-field-label">System prompt</label>
            <textarea className="v2-textarea" rows={8} value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} disabled={!isAdmin}
              placeholder="Instructions that define the agent's behavior…" />
          </div>
        </div>
      </section>

      <section className="v2-card">
        <div className="v2-card-header"><h2 className="v2-card-title">Runtime & interaction</h2></div>
        <div className="v2-card-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="v2-field">
            <label className="v2-field-label">Runtime profile</label>
            <select className="v2-select" value={runtimeProfile} onChange={(e) => setRuntimeProfile(e.target.value)} disabled={!isAdmin}>
              <option value="standard">Standard</option>
              <option value="technical">Technical</option>
            </select>
          </div>
          <div className="v2-field">
            <label className="v2-field-label">Hermes version</label>
            <select className="v2-select" value={hermesVersion} onChange={(e) => setHermesVersion(e.target.value)} disabled={!isAdmin}>
              <option value="">Instance default</option>
              {hermesVersions.map((v) => <option key={v.version} value={v.release_tag ?? ""}>{v.version}</option>)}
            </select>
          </div>
          <div className="v2-field">
            <label className="v2-field-label">Approval mode</label>
            <select className="v2-select" value={approvalMode} onChange={(e) => setApprovalMode(e.target.value)} disabled={!isAdmin}>
              <option value="inherit">Inherit</option>
              <option value="off">Off</option>
              <option value="on_request">On request</option>
              <option value="on_failure">On failure</option>
            </select>
          </div>
          <div className="v2-field">
            <label className="v2-field-label">Tool progress mode</label>
            <select className="v2-select" value={toolProgressMode} onChange={(e) => setToolProgressMode(e.target.value)} disabled={!isAdmin}>
              <option value="inherit">Inherit</option>
              <option value="on">On</option>
              <option value="off">Off</option>
            </select>
          </div>
          <div className="v2-field">
            <label className="v2-field-label">Gateway notifications</label>
            <select className="v2-select" value={gatewayNotifMode} onChange={(e) => setGatewayNotifMode(e.target.value)} disabled={!isAdmin}>
              <option value="inherit">Inherit</option>
              <option value="all">All</option>
              <option value="result">Result only</option>
              <option value="off">Off</option>
            </select>
          </div>
        </div>
      </section>

      <section className="v2-card" style={{ gridColumn: "1 / -1" }}>
        <div className="v2-card-header"><h2 className="v2-card-title">Fallback provider</h2></div>
        <div className="v2-card-body">
          <p className="v2-field-hint" style={{ marginBottom: 14 }}>
            When the primary provider fails (rate limit, auth error, timeout), the agent retries with this fallback.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 14 }}>
            <div className="v2-field">
              <label className="v2-field-label">Provider</label>
              <select className="v2-select" value={fbProvider} onChange={(e) => setFbProvider(e.target.value)} disabled={!isAdmin}>
                <option value="">None</option>
                {providers.filter((p) => p.enabled).map((p) => <option key={p.slug} value={p.runtime_provider}>{p.name}</option>)}
              </select>
            </div>
            <div className="v2-field">
              <label className="v2-field-label">Model</label>
              {(fbProviderDef?.available_models ?? []).length > 0 ? (
                <select className="v2-select" value={fbModel} onChange={(e) => setFbModel(e.target.value)} disabled={!isAdmin || !fbProvider}>
                  <option value="">Default</option>
                  {(fbProviderDef?.available_models ?? []).map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              ) : (
                <input className="v2-input" value={fbModel} onChange={(e) => setFbModel(e.target.value)} disabled={!isAdmin || !fbProvider} />
              )}
            </div>
            <div className="v2-field">
              <label className="v2-field-label">API key</label>
              <select className="v2-select" value={fbKeyRef} onChange={(e) => setFbKeyRef(e.target.value)} disabled={!isAdmin || !fbProvider}>
                <option value="">None</option>
                {secrets.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
              </select>
            </div>
            <div className="v2-field">
              <label className="v2-field-label">Base URL</label>
              <input className="v2-input v2-mono" value={fbBaseUrl} onChange={(e) => setFbBaseUrl(e.target.value)} disabled={!isAdmin || !fbProvider} />
            </div>
          </div>
        </div>
      </section>

      <section className="v2-card" style={{ gridColumn: "1 / -1" }}>
        <div className="v2-card-header"><h2 className="v2-card-title">Auxiliary models</h2></div>
        <div className="v2-card-body">
          <p className="v2-field-hint" style={{ marginBottom: 14 }}>
            Override the provider/model used for background tasks (vision, compression, web extraction). Leave empty to use the agent's default.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
            {AUX_TASKS.map((task) => {
              const entry = auxDraft[task.key] ?? { provider: null, model: null, api_key_ref: null, base_url: null };
              const auxProv = providers.find((p) => p.runtime_provider === entry.provider && (p.available_models ?? []).length > 0);
              return (
                <div key={task.key} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div className="v2-field-label">{task.label}</div>
                  <select
                    className="v2-select"
                    value={entry.provider ?? ""}
                    onChange={(e) => setAuxDraft((prev) => ({
                      ...prev,
                      [task.key]: { ...entry, provider: e.target.value || null },
                    }))}
                    disabled={!isAdmin}
                  >
                    <option value="">Use default</option>
                    {providers.filter((p) => p.enabled).map((p) => (
                      <option key={p.slug} value={p.runtime_provider}>{p.name}</option>
                    ))}
                  </select>
                  {entry.provider ? (
                    <>
                      <select
                        className="v2-select"
                        value={entry.model ?? ""}
                        onChange={(e) => setAuxDraft((prev) => ({
                          ...prev,
                          [task.key]: { ...entry, model: e.target.value || null },
                        }))}
                        disabled={!isAdmin}
                      >
                        <option value="">Default model</option>
                        {(auxProv?.available_models ?? []).map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                      <select
                        className="v2-select"
                        value={entry.api_key_ref ?? ""}
                        onChange={(e) => setAuxDraft((prev) => ({
                          ...prev,
                          [task.key]: { ...entry, api_key_ref: e.target.value || null },
                        }))}
                        disabled={!isAdmin}
                      >
                        <option value="">Default key</option>
                        {secrets.map((s) => (
                          <option key={s.name} value={s.name}>{s.name}</option>
                        ))}
                      </select>
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <div style={{ gridColumn: "1 / -1", display: "flex", gap: 10, alignItems: "center" }}>
        {isAdmin ? (
          <button className="v2-btn v2-btn-primary" onClick={() => saveRuntimeConfig()} disabled={updateAgent.isPending}>
            {updateAgent.isPending ? "Saving…" : "Save all changes"}
          </button>
        ) : null}
        <Link to={`/agents/${agent.id}`} className="v2-btn v2-btn-ghost" style={{ fontSize: 12.5 }}>
          Open classic view →
        </Link>
      </div>
    </div>
  );
}
