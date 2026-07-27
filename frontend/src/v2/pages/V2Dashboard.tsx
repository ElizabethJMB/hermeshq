import { Link } from "react-router-dom";
import { useMemo } from "react";

import { useAgents, useAgentAction } from "../../api/agents";
import { useFleetHealth, useDashboardOverview, useTaskAnalytics } from "../../api/dashboard";
import { useTasks } from "../../api/tasks";
import { v2toast, extractErrorMessage } from "../toast";
import { AgentAvatar } from "../../components/AgentAvatar";
import { AreaChart, DonutChart, HBarChart, Sparkline, formatDuration } from "../charts";
import { useI18n } from "../../lib/i18n";

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
  const { t } = useI18n();
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
    const completed = { name: t("v2.completed"), color: "var(--v2-success)", points: [] as { label: string; value: number }[] };
    const failed = { name: t("v2.failed"), color: "var(--v2-danger)", points: [] as { label: string; value: number }[] };
    const other = { name: t("v2.other"), color: "var(--v2-text-muted)", points: [] as { label: string; value: number }[] };
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
  }, [analytics, t]);

  const agentStatusSegments = useMemo(() => {
    const breakdown = health?.status_breakdown ?? {};
    return [
      { label: t("v2.running"), value: breakdown.running ?? 0, color: "var(--v2-success)" },
      { label: t("v2.stopped"), value: breakdown.stopped ?? 0, color: "var(--v2-text-muted)" },
      { label: t("v2.errorLabel"), value: breakdown.error ?? 0, color: "var(--v2-danger)" },
      { label: t("v2.starting"), value: breakdown.starting ?? 0, color: "var(--v2-warning)" },
    ].filter((s) => s.value > 0 || s.label === t("v2.running"));
  }, [health, t]);

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
      v2toast.success(t("v2.agentStarted", { name }));
    } catch (error) {
      v2toast.error(extractErrorMessage(error, t("v2.failedToStart", { name })));
    }
  }

  async function handleStop(agentId: string, name: string) {
    try {
      await stopAgent.mutateAsync(agentId);
      v2toast.success(t("v2.agentStopped", { name }));
    } catch (error) {
      v2toast.error(extractErrorMessage(error, t("v2.failedToStop", { name })));
    }
  }

  return (
    <div>
      <div className="v2-page-header">
        <div>
          <h1 className="v2-page-title">{t("v2.fleetOverview")}</h1>
          <p className="v2-page-subtitle">
            {(agents ?? []).length} {t("v2.agentsConfigured")} · {running} {t("v2.running")}
          </p>
        </div>
        <Link to="/v2/agents" className="v2-btn v2-btn-primary">
          {t("v2.newAgent")}
        </Link>
      </div>

      <div className="v2-kpi-strip">
        <div className="v2-kpi" data-tone={running > 0 ? "success" : undefined}>
          <div className="v2-kpi-label">{t("v2.running")}</div>
          <div className="v2-kpi-value">{running}</div>
          <div className="v2-kpi-hint">{t("v2.activeNow")}</div>
        </div>
        <div className="v2-kpi" data-tone={errored > 0 ? "error" : undefined}>
          <div className="v2-kpi-label">{t("v2.errors")}</div>
          <div className="v2-kpi-value">{errored}</div>
          <div className="v2-kpi-hint">{t("v2.needAttention")}</div>
        </div>
        <div className="v2-kpi" data-tone={successRate !== null && successRate < 0.9 ? "warn" : "success"}>
          <div className="v2-kpi-label">{t("v2.successRate")}</div>
          <div className="v2-kpi-value">{successRate !== null ? `${Math.round(successRate)}%` : "—"}</div>
          <div className="v2-kpi-hint">{t("v2.lastNDays", { n: analytics?.period_days ?? 14 })} · {analytics?.totals?.total ?? 0} {t("v2.tasks")}</div>
        </div>
        <div className="v2-kpi">
          <div className="v2-kpi-label">{t("v2.avgCompletion")}</div>
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
            <h2 className="v2-card-title">{t("v2.taskVolume")}</h2>
          </div>
          <div className="v2-card-body">
            {trendSeries.length > 0 && trendSeries[0].points.length > 0 ? (
              <AreaChart series={trendSeries} height={190} stacked />
            ) : (
              <div className="v2-empty">
                <p className="v2-empty-text">{t("v2.noTaskDataYet")}</p>
              </div>
            )}
          </div>
        </section>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <section className="v2-card">
            <div className="v2-card-header">
              <h2 className="v2-card-title">{t("v2.fleetStatus")}</h2>
            </div>
            <div className="v2-card-body">
              <DonutChart
                segments={agentStatusSegments}
                size={130}
                centerValue={(agents ?? []).length}
                centerLabel={t("v2.agents")}
              />
            </div>
          </section>

          {topFailing.length > 0 ? (
            <section className="v2-card">
              <div className="v2-card-header">
                <h2 className="v2-card-title">{t("v2.topFailingAgents")}</h2>
              </div>
              <div className="v2-card-body">
                <HBarChart bars={topFailing} formatValue={(v) => `${v} ${t("v2.fails")}`} />
              </div>
            </section>
          ) : null}
        </div>
      </div>

      <div className="v2-grid-2">
        <section className="v2-card">
          <div className="v2-card-header">
            <h2 className="v2-card-title">{t("v2.agents")}</h2>
            <Link to="/v2/agents" className="v2-btn v2-btn-ghost" style={{ fontSize: 12 }}>
              {t("v2.viewAll")} →
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
                <p className="v2-empty-title">{t("v2.noAgentsYet")}</p>
                <p className="v2-empty-text">{t("v2.createFirstAgent")}</p>
                <div className="v2-empty-action">
                  <Link to="/v2/agents" className="v2-btn v2-btn-primary">{t("v2.createAgent")}</Link>
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
                        {t("v2.stop")}
                      </button>
                    ) : (
                      <button
                        className="v2-btn v2-btn-secondary"
                        style={{ padding: "5px 10px", fontSize: 12 }}
                        disabled={startAgent.isPending}
                        onClick={() => void handleStart(agent.id, name)}
                      >
                        {t("v2.start")}
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
            <h2 className="v2-card-title">{t("v2.recentTasks")}</h2>
            <Link to="/v2/tasks" className="v2-btn v2-btn-ghost" style={{ fontSize: 12 }}>
              {t("v2.board")} →
            </Link>
          </div>
          <div>
            {recentTasks.length === 0 ? (
              <div className="v2-empty">
                <p className="v2-empty-title">{t("v2.noTasksYet")}</p>
                <p className="v2-empty-text">{t("v2.noTasksDispatched")}</p>
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
            <h2 className="v2-card-title" style={{ color: "var(--v2-danger)" }}>{t("v2.needsAttention")}</h2>
          </div>
          <div>
            {health!.recent_errors.slice(0, 5).map((error, i) => (
              <div key={i} className="v2-agent-row">
                <span className="v2-pill" data-tone="error">
                  <span className="v2-pill-dot" />
                  {t("v2.error")}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="v2-agent-name" style={{ fontSize: 13 }}>{error.agent_name}</div>
                  <div className="v2-agent-meta" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {error.message ?? t("v2.unknownError")}
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
