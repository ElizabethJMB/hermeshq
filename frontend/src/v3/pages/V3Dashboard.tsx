import { Link } from "react-router-dom";
import { useMemo } from "react";

import { useAgents } from "../../api/agents";
import { useTasks } from "../../api/tasks";
import { useRealtimeStore } from "../../stores/realtimeStore";

function statusTone(status: string): "ok" | "err" | "idle" {
  if (status === "running") return "ok";
  if (status === "error") return "err";
  return "idle";
}

function eventTone(type: string, status?: string): "error" | "success" | "info" | undefined {
  if (type.includes("failed") || status === "failed" || status === "error") return "error";
  if (type.includes("completed") || status === "completed") return "success";
  if (type.includes("started") || type.includes("progress")) return "info";
  return undefined;
}

function eventTime(): string {
  return new Date().toLocaleTimeString("en-GB", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function V3Dashboard() {
  const { data: agents, isLoading } = useAgents();
  const { data: tasks } = useTasks();
  const events = useRealtimeStore((state) => state.events);

  const running = (agents ?? []).filter((a) => a.status === "running").length;
  const errored = (agents ?? []).filter((a) => a.status === "error").length;
  const totalTasks = (tasks ?? []).length;
  const failedTasks = (tasks ?? []).filter((t) => t.status === "failed").length;

  const recentTasks = useMemo(
    () =>
      [...(tasks ?? [])]
        .sort((a, b) => new Date(b.queued_at).getTime() - new Date(a.queued_at).getTime())
        .slice(0, 10),
    [tasks],
  );

  const agentsById = useMemo(() => new Map((agents ?? []).map((a) => [a.id, a])), [agents]);

  return (
    <div>
      <div className="v3-kpis">
        <div className="v3-kpi" data-tone={running > 0 ? "ok" : undefined}>
          <div className="v3-kpi-label">Running</div>
          <div className="v3-kpi-value">{running}</div>
        </div>
        <div className="v3-kpi" data-tone={errored > 0 ? "err" : undefined}>
          <div className="v3-kpi-label">Errors</div>
          <div className="v3-kpi-value">{errored}</div>
        </div>
        <div className="v3-kpi">
          <div className="v3-kpi-label">Total tasks</div>
          <div className="v3-kpi-value">{totalTasks}</div>
        </div>
        <div className="v3-kpi" data-tone={failedTasks > 0 ? "warn" : undefined}>
          <div className="v3-kpi-label">Failed</div>
          <div className="v3-kpi-value">{failedTasks}</div>
        </div>
      </div>

      <div className="v3-grid v3-grid-2">
        <div className="v3-grid" style={{ gap: 14 }}>
          <section className="v3-panel">
            <div className="v3-panel-header">
              <span className="v3-panel-title">Fleet status</span>
              <Link to="/v3/agents" style={{ fontFamily: "var(--v3-font-mono)", fontSize: 10, color: "var(--v3-text-dim)", textDecoration: "none", textTransform: "uppercase" }}>
                all →
              </Link>
            </div>
            <div className="v3-panel-body">
              {isLoading ? (
                <div className="v3-fleet-grid">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="v3-skeleton" style={{ height: 62 }} />
                  ))}
                </div>
              ) : (agents ?? []).length === 0 ? (
                <div className="v3-empty">No agents deployed</div>
              ) : (
                <div className="v3-fleet-grid">
                  {(agents ?? []).map((agent) => {
                    const name = agent.friendly_name || agent.name;
                    return (
                      <Link key={agent.id} to={`/v3/agents/${agent.id}`} className="v3-fleet-cell" data-status={agent.status}>
                        <span className="v3-fleet-cell-status" data-tone={statusTone(agent.status)} />
                        <div className="v3-fleet-cell-name">{name}</div>
                        <div className="v3-fleet-cell-meta">
                          {agent.status} · {agent.model?.split("/").pop() ?? agent.provider}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          <section className="v3-panel">
            <div className="v3-panel-header">
              <span className="v3-panel-title">Recent tasks</span>
              <Link to="/v3/tasks" style={{ fontFamily: "var(--v3-font-mono)", fontSize: 10, color: "var(--v3-text-dim)", textDecoration: "none", textTransform: "uppercase" }}>
                all →
              </Link>
            </div>
            <table className="v3-table">
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Agent</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentTasks.length === 0 ? (
                  <tr>
                    <td colSpan={3}>
                      <div className="v3-empty">No tasks dispatched</div>
                    </td>
                  </tr>
                ) : (
                  recentTasks.map((task) => {
                    const agent = agentsById.get(task.agent_id);
                    return (
                      <tr key={task.id}>
                        <td style={{ maxWidth: 260 }}>
                          <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 550 }}>
                            {task.title || task.prompt.slice(0, 60)}
                          </div>
                        </td>
                        <td>
                          <span style={{ fontFamily: "var(--v3-font-mono)", fontSize: 11, color: "var(--v3-text-dim)" }}>
                            {agent?.friendly_name || agent?.name || task.agent_id.slice(0, 8)}
                          </span>
                        </td>
                        <td>
                          <span className="v3-pill" data-tone={
                            task.status === "completed" ? "ok" :
                            task.status === "failed" || task.status === "cancelled" ? "err" :
                            task.status === "running" ? "run" : "warn"
                          }>
                            {task.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </section>
        </div>

        <section className="v3-panel" style={{ alignSelf: "start" }}>
          <div className="v3-panel-header">
            <span className="v3-panel-title">Live activity</span>
            <span style={{ fontFamily: "var(--v3-font-mono)", fontSize: 10, color: "var(--v3-success)" }}>
              ● stream
            </span>
          </div>
          <div className="v3-feed">
            {events.length === 0 ? (
              <div className="v3-empty">Awaiting events…</div>
            ) : (
              events.slice(0, 40).map((event, i) => {
                const agent = event.agent_id ? agentsById.get(event.agent_id) : null;
                const tone = eventTone(event.type, event.status);
                return (
                  <div key={`${event.type}-${i}`} className="v3-feed-line" data-tone={tone}>
                    <span className="v3-feed-time">{eventTime()}</span>
                    <span className="v3-feed-type">{event.type}</span>
                    <span className="v3-feed-msg">
                      {agent ? `[${agent.friendly_name || agent.name}] ` : ""}
                      {event.message ?? event.response?.slice(0, 80) ?? event.status ?? ""}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
