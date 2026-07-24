import { Link } from "react-router-dom";
import { useMemo, useState } from "react";

import { useAgents, useAgentAction } from "../../api/agents";
import { v2toast, extractErrorMessage } from "../../v2/toast";

function statusTone(status: string): "ok" | "err" | "idle" {
  if (status === "running") return "ok";
  if (status === "error") return "err";
  return "idle";
}

export function V3AgentsPage() {
  const { data: agents, isLoading } = useAgents();
  const startAgent = useAgentAction("start");
  const stopAgent = useAgentAction("stop");
  const [filter, setFilter] = useState("");

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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div style={{ fontFamily: "var(--v3-font-mono)", fontSize: 11, color: "var(--v3-text-dim)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          {filtered.length} / {(agents ?? []).length} agents
        </div>
        <input
          className="v3-input"
          style={{ width: 260 }}
          placeholder="Filter agents…  (⌘K for commands)"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      <section className="v3-panel">
        {isLoading ? (
          <div className="v3-panel-body" style={{ display: "grid", gap: 8 }}>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="v3-skeleton" style={{ height: 52 }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="v3-empty">{filter ? "No match" : "No agents deployed"}</div>
        ) : (
          <table className="v3-table">
            <thead>
              <tr>
                <th>Agent</th>
                <th>Model</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((agent) => {
                const name = agent.friendly_name || agent.name;
                const isRunning = agent.status === "running";
                return (
                  <tr key={agent.id}>
                    <td>
                      <Link to={`/v3/agents/${agent.id}`} style={{ color: "inherit", textDecoration: "none", fontWeight: 600 }}>
                        {name}
                      </Link>
                      <div style={{ fontFamily: "var(--v3-font-mono)", fontSize: 10, color: "var(--v3-text-dim)", marginTop: 2 }}>
                        {agent.slug}
                      </div>
                    </td>
                    <td>
                      <span style={{ fontFamily: "var(--v3-font-mono)", fontSize: 11, color: "var(--v3-text-secondary)" }}>
                        {agent.model ?? agent.provider}
                      </span>
                    </td>
                    <td>
                      <span className="v3-pill" data-tone={statusTone(agent.status)}>
                        {agent.status}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {isRunning ? (
                        <button className="v3-btn v3-btn-outline" style={{ padding: "4px 10px", fontSize: 11.5 }} disabled={stopAgent.isPending} onClick={() => void handleStop(agent.id, name)}>
                          Stop
                        </button>
                      ) : (
                        <button className="v3-btn v3-btn-primary" style={{ padding: "4px 10px", fontSize: 11.5 }} disabled={startAgent.isPending} onClick={() => void handleStart(agent.id, name)}>
                          Start
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
