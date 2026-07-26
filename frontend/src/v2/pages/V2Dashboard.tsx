import { Link } from "react-router-dom";
import { useMemo } from "react";

import { useAgents, useAgentAction } from "../../api/agents";
import { useFleetHealth, useDashboardOverview, useTaskAnalytics } from "../../api/dashboard";
import { useTasks } from "../../api/tasks";
import { v2toast, extractErrorMessage } from "../toast";
import { AgentAvatar } from "../../components/AgentAvatar";
import { AreaChart, DonutChart, HBarChart, Sparkline, formatDuration } from "../charts";

function statusTone(status: string): "success" | "error" | "warn" | "neutral" {
  if (status === "running") return "success";
  if (status === "error" || status === "failed") return "error";
  if (status === "starting" || status === "paused") return "warn";
  return "neutral";
}

function taskTone(status: string): "success" | "error" | "warn" | "info" | "neutral" {
  if (status === "completed") return "success";
  if (status === "failed" || status === "cancelled") return "error";
  if (status === "running") return "info";
  if (status === "queued") return "warn";
  return "neutral";
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function V2Dashboard() {
  const { data: agents, isLoading: agentsLoading } = useAgents();
  const { data: overview } = useDashboardOverview();
  const { data: health } = useFleetHealth();
  const { data: analytics } = useTaskAnalytics(14);
  const { data: tasks } = useTasks();
  const startAgent = useAgentAction("start");
  const stopAgent = useAgentAction("stop");

  const running = (agents ?? []).filter((a) => a.status === "running").length;
  const errored = (agents ?? []).filter((a) => a.status === "error").length;
  const stopped = (agents ?? []).filter((a) => a.status === "stopped").length;
  const recentTasks = (tasks ?? []).slice(0, 8);

  const trendSeries = useMemo(() => {
    if (!analytics?.time_series) return [];
    const days = Object.keys(analytics.time_series).sort();
    const completed = { name: "Completed", color: "var(--v2-success)", points: [] as { label: string; value: number }[] };
    const failed = { name: "Failed", color: "var(--v2-danger)", points: [] as { label: string; value: number }[] };
    const other = { name: "Other", color: "var(--v2-text-muted)", points: [] as { label: string; value: number }[] };
    for (const day of days) {
      const bucket = analytics.time_series[day] ?? {};
      const label = shortDate(day);
      completed.points.push({ label, value: bucket.completed ?? 0 });
      failed.points.push({ label, value: bucket.failed ?? 0 });
      const otherCount = Object.entries(bucket)
        .filter(([k]) => k !== "completed" && k !== "failed")
        .reduce((sum, [, v]) => sum + v, 0);
      other.points.push({ label, value: otherCount });
    }
    return [completed, failed, other];
  }, [analytics]);

  const agentStatusSegments = useMemo(() => {
    const breakdown = health?.status_breakdown ?? {};
    return [
      { label: "Running", value: breakdown.running ?? 0, color: "var(--v2-success)" },
      { label: "Stopped", value: breakdown.stopped ?? 0, color: "var(--v2-text-muted)" },
      { label: "Error", value: breakdown.error ?? 0, color: "var(--v2-danger)" },
      { label: "Starting", value: breakdown.starting ?? 0, color: "var(--v2-warning)" },
    ].filter((s) => s.value > 0 || s.label === "Running");
  }, [health]);

  const topFailing = useMemo(
    () =>
      (analytics?.top_failing_agents ?? []).slice(0, 5).map((a) => ({
        label: a.agent_name,
        value: a.fail_count,
        color: "var(--v2-danger)",
      })),
    [analytics],
  );

  const successRate = analytics?.totals?.success_rate ?? null;

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
          <h1 className="v2-page-title">Fleet overview</h1>
          <p className="v2-page-subtitle">
            {(agents ?? []).length} agents configured · {running} running
          </p>
        </div>
        <Link to="/v2/agents" className="v2-btn v2-btn-primary">
          New agent
        </Link>
      </div>

      <div className="v2-kpi-strip">
        <div className="v2-kpi" data-tone={running > 0 ? "success" : undefined}>
          <div className="v2-kpi-label">Running</div>
          <div className="v2-kpi-value">{running}</div>
          <div className="v2-kpi-hint">agents active now</div>
        </div>
        <div className="v2-kpi" data-tone={errored > 0 ? "error" : undefined}>
          <div className="v2-kpi-label">Errors</div>
          <div className="v2-kpi-value">{errored}</div>
          <div className="v2-kpi-hint">agents need attention</div>
        </div>
        <div className="v2-kpi" data-tone={successRate !== null && successRate < 0.9 ? "warn" : "success"}>
          <div className="v2-kpi-label">Success rate</div>
          <div className="v2-kpi-value">{successRate !== null ? `${Math.round(successRate)}%` : "—"}</div>
          <div className="v2-kpi-hint">last {analytics?.period_days ?? 14} days · {analytics?.totals?.total ?? 0} tasks</div>
        </div>
        <div className="v2-kpi">
          <div className="v2-kpi-label">Avg completion</div>
          <div className="v2-kpi-value" style={{ fontSize: 24 }}>
            {analytics?.completion_metrics ? formatDuration(analytics.completion_metrics.avg_seconds) : "—"}
          </div>
          <div className="v2-kpi-hint">
            p95 {analytics?.completion_metrics ? formatDuration(analytics.completion_metrics.p95_seconds) : "—"}
          </div>
        </div>
      </div>

      <div className="v2-grid-2 v2-section" style={{ alignItems: "stretch" }}>
        <section className="v2-card">
          <div className="v2-card-header">
            <h2 className="v2-card-title">Task volume · 14 days</h2>
          </div>
          <div className="v2-card-body">
            {trendSeries.length > 0 && trendSeries[0].points.length > 0 ? (
              <AreaChart series={trendSeries} height={190} stacked />
            ) : (
              <div className="v2-empty">
                <p className="v2-empty-text">No task data yet</p>
              </div>
            )}
          </div>
        </section>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <section className="v2-card">
            <div className="v2-card-header">
              <h2 className="v2-card-title">Fleet status</h2>
            </div>
            <div className="v2-card-body">
              <DonutChart
                segments={agentStatusSegments}
                size={130}
                centerValue={(agents ?? []).length}
                centerLabel="agents"
              />
            </div>
          </section>

          {topFailing.length > 0 ? (
            <section className="v2-card">
              <div className="v2-card-header">
                <h2 className="v2-card-title">Top failing agents</h2>
              </div>
              <div className="v2-card-body">
                <HBarChart bars={topFailing} formatValue={(v) => `${v} fails`} />
              </div>
            </section>
          ) : null}
        </div>
      </div>

      <div className="v2-grid-2">
        <section className="v2-card">
          <div className="v2-card-header">
            <h2 className="v2-card-title">Agents</h2>
            <Link to="/v2/agents" className="v2-btn v2-btn-ghost" style={{ fontSize: 12 }}>
              View all →
            </Link>
          </div>
          <div>
            {agentsLoading ? (
              <div style={{ padding: 20 }}>
                <div className="v2-skeleton" style={{ height: 48, marginBottom: 8 }} />
                <div className="v2-skeleton" style={{ height: 48, marginBottom: 8 }} />
                <div className="v2-skeleton" style={{ height: 48 }} />
              </div>
            ) : (agents ?? []).length === 0 ? (
              <div className="v2-empty">
                <p className="v2-empty-title">No agents yet</p>
                <p className="v2-empty-text">Create your first agent to start dispatching tasks.</p>
                <div className="v2-empty-action">
                  <Link to="/v2/agents" className="v2-btn v2-btn-primary">Create agent</Link>
                </div>
              </div>
            ) : (
              (agents ?? []).slice(0, 6).map((agent) => {
                const name = agent.friendly_name || agent.name;
                const isRunning = agent.status === "running";
                return (
                  <div key={agent.id} className="v2-agent-row">
                    <Link to={`/v2/agents/${agent.id}`} style={{ display: "flex", alignItems: "center", gap: 14, flex: 1, textDecoration: "none", color: "inherit", minWidth: 0 }}>
                      <AgentAvatar agent={agent} sizeClass="h-9 w-9" roundedClass="rounded-lg" />
                      <div style={{ minWidth: 0 }}>
                        <div className="v2-agent-name">{name}</div>
                        <div className="v2-agent-meta">{agent.model?.split("/").pop() ?? agent.provider}</div>
                      </div>
                    </Link>
                    <span className="v2-pill" data-tone={statusTone(agent.status)}>
                      <span className="v2-pill-dot" />
                      {agent.status}
                    </span>
                    {isRunning ? (
                      <button
                        className="v2-btn v2-btn-secondary"
                        style={{ padding: "5px 10px", fontSize: 12 }}
                        disabled={stopAgent.isPending}
                        onClick={() => void handleStop(agent.id, name)}
                      >
                        Stop
                      </button>
                    ) : (
                      <button
                        className="v2-btn v2-btn-secondary"
                        style={{ padding: "5px 10px", fontSize: 12 }}
                        disabled={startAgent.isPending}
                        onClick={() => void handleStart(agent.id, name)}
                      >
                        Start
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section className="v2-card">
          <div className="v2-card-header">
            <h2 className="v2-card-title">Recent tasks</h2>
            <Link to="/v2/tasks" className="v2-btn v2-btn-ghost" style={{ fontSize: 12 }}>
              Board →
            </Link>
          </div>
          <div>
            {recentTasks.length === 0 ? (
              <div className="v2-empty">
                <p className="v2-empty-title">No tasks yet</p>
                <p className="v2-empty-text">Tasks dispatched to your agents will appear here.</p>
              </div>
            ) : (
              recentTasks.map((task) => (
                <div key={task.id} className="v2-agent-row" style={{ gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="v2-agent-name" style={{ fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {task.title || task.prompt.slice(0, 60)}
                    </div>
                    <div className="v2-agent-meta">
                      {(agents ?? []).find((a) => a.id === task.agent_id)?.friendly_name ?? task.agent_id.slice(0, 8)}
                    </div>
                  </div>
                  <span className="v2-pill" data-tone={taskTone(task.status)}>
                    <span className="v2-pill-dot" />
                    {task.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {(health?.recent_errors?.length ?? 0) > 0 ? (
        <section className="v2-card v2-section" style={{ marginTop: 16 }}>
          <div className="v2-card-header">
            <h2 className="v2-card-title" style={{ color: "var(--v2-danger)" }}>Needs attention</h2>
          </div>
          <div>
            {health!.recent_errors.slice(0, 5).map((error, i) => (
              <div key={i} className="v2-agent-row">
                <span className="v2-pill" data-tone="error">
                  <span className="v2-pill-dot" />
                  error
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="v2-agent-name" style={{ fontSize: 13 }}>{error.agent_name}</div>
                  <div className="v2-agent-meta" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {error.message ?? "Unknown error"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
