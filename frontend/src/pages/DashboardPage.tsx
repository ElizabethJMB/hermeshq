import { Link } from "react-router-dom";

import { useAgents } from "../api/agents";
import { AgentAvatar } from "../components/AgentAvatar";
import { useDashboardOverview, useDashboardChannels, useFleetHealth, useTaskAnalytics } from "../api/dashboard";
import { AgentOrgChart } from "../components/AgentOrgChart";
import { useI18n } from "../lib/i18n";
import { UserAvatar } from "../components/UserAvatar";
import { useRealtimeStore } from "../stores/realtimeStore";
import { useSessionStore } from "../stores/sessionStore";

function statusTone(status: string) {
  if (status === "running") return "text-[var(--success)]";
  if (status === "queued" || status === "starting") return "text-[var(--warning)]";
  if (status === "error") return "text-[var(--accent)]";
  return "text-[var(--text-secondary)]";
}

function statusBadgeTone(status: string) {
  if (status === "running") return "border-[color-mix(in_srgb,var(--success)_45%,transparent)] bg-[color-mix(in_srgb,var(--success)_16%,transparent)] text-[var(--success)]";
  if (status === "queued" || status === "starting") return "border-[color-mix(in_srgb,var(--warning)_45%,transparent)] bg-[color-mix(in_srgb,var(--warning)_14%,transparent)] text-[var(--warning)]";
  if (status === "error" || status === "failed") return "border-[color-mix(in_srgb,var(--accent)_45%,transparent)] bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-[var(--accent)]";
  return "border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_76%,transparent)] text-[var(--text-secondary)]";
}

function FleetHealthPanel() {
  const { data: health, isError: healthError } = useFleetHealth();
  const { t } = useI18n();

  if (healthError) return <div className="panel-frame p-5 text-sm text-[var(--accent)]">{t("dashboard.metricsError")}</div>;
  if (!health) return null;

  const statusColors: Record<string, string> = {
    running: "text-[var(--success)]",
    stopped: "text-[var(--text-secondary)]",
    error: "text-[var(--accent)]",
    crashed: "text-[var(--accent)]",
  };

  const taskColors: Record<string, string> = {
    completed: "text-[var(--success)]",
    failed: "text-[var(--accent)]",
    queued: "text-[var(--warning)]",
    running: "text-[var(--info)]",
  };

  const totalAgents = Object.values(health.status_breakdown).reduce((a: number, b: number) => a + b, 0);

  return (
    <div className="panel-frame p-5">
      <div className="flex items-center justify-between">
        <p className="panel-label">{t("dashboard.fleetHealth")}</p>
        <span className="text-xs text-[var(--text-disabled)]">
          {t("dashboard.lastUpdated")}: {new Date(health.last_updated).toLocaleTimeString()}
        </span>
      </div>

      {/* Agent Status Chips */}
      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
        <div className="dashboard-metric-chip">
          <p className="panel-label">{t("dashboard.totalAgents")}</p>
          <p className="mt-1 text-2xl text-[var(--text-display)]">{totalAgents}</p>
        </div>
        {Object.entries(health.status_breakdown).map(([status, count]) => (
          <div key={status} className="dashboard-metric-chip">
            <p className="panel-label">
              {status === "running" ? t("dashboard.runningAgents")
                : status === "stopped" ? t("dashboard.stoppedAgents")
                : status === "error" ? t("dashboard.errorAgents")
                : status}
            </p>
            <p className={`mt-1 text-2xl ${statusColors[status] || "text-[var(--text-display)]"}`}>
              {count as number}
            </p>
          </div>
        ))}
      </div>

      {/* Task Outcomes */}
      <div className="mt-3 flex flex-wrap gap-4 border-t border-[var(--border)] pt-3">
        <p className="panel-label self-center">{t("dashboard.taskOutcomes")}:</p>
        {Object.entries(health.task_summary).map(([status, count]) => (
          <div key={status} className="flex items-center gap-1">
            <span className={`text-sm font-medium ${taskColors[status] || ""}`}>
              {count as number}
            </span>
            <span className="text-xs text-[var(--text-disabled)]">
              {status === "completed" ? t("dashboard.completed")
                : status === "failed" ? t("dashboard.failed")
                : status === "queued" ? t("dashboard.queued")
                : status === "running" ? t("dashboard.runningTasks")
                : status}
            </span>
          </div>
        ))}
      </div>

      {/* Recent Errors or Healthy Message */}
      {health.recent_errors.length > 0 ? (
        <div className="mt-3 border-t border-[var(--border)] pt-3">
          <p className="panel-label text-[var(--accent)]">
            {t("dashboard.recentErrors", { count: health.recent_errors.length })}
          </p>
          <div className="mt-2 max-h-40 overflow-y-auto">
            {health.recent_errors.map((err, i) => (
              <div key={i} className="flex items-start gap-2 py-1 text-sm">
                <span className="text-[var(--accent)]">⚠</span>
                <span className="shrink-0 text-[var(--text-disabled)]">
                  [{err.agent_name}]
                </span>
                <span className="text-[var(--text-secondary)] truncate">
                  {err.message || t("dashboard.noMessage")}
                </span>
                <span className="ml-auto shrink-0 text-xs text-[var(--text-disabled)]">
                  {err.timestamp ? new Date(err.timestamp).toLocaleTimeString() : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-3 border-t border-[var(--border)] pt-3 text-sm text-[var(--success)]">
          ✅ {t("dashboard.healthyFleet")}
        </p>
      )}
    </div>
  );
}

function TaskAnalyticsPanel() {
  const { data: analytics, isError: analyticsError } = useTaskAnalytics(14);
  const { t } = useI18n();

  if (analyticsError) return <div className="panel-frame p-5 text-sm text-[var(--accent)]">{t("dashboard.metricsError")}</div>;
  if (!analytics) return null;

  const days = Object.keys(analytics.time_series).sort();
  const maxDailyTotal = Math.max(
    ...days.map((d) => {
      const dayData = analytics.time_series[d];
      return (dayData.completed || 0) + (dayData.failed || 0) + (dayData.queued || 0) + (dayData.running || 0);
    }),
    1,
  );

  return (
    <div className="panel-frame p-5">
      <div className="flex items-center justify-between">
        <p className="panel-label">{t("dashboard.taskAnalytics")}</p>
        <span className="text-xs text-[var(--text-disabled)]">{t("dashboard.last14Days")}</span>
      </div>

      {/* Bar Chart */}
      <div className="mt-4">
        <p className="panel-label mb-2">{t("dashboard.dailyTasks")}</p>
        <div className="flex items-end gap-[3px] h-28 overflow-x-auto">
          {days.map((day) => {
            const d = analytics.time_series[day];
            const completed = d.completed || 0;
            const failed = d.failed || 0;
            const total = completed + failed;
            const h = Math.max((total / maxDailyTotal) * 100, 2);
            return (
              <div key={day} className="flex flex-col items-center gap-0.5 min-w-[18px]" title={`${day}: ${completed} ok, ${failed} fail`}>
                <div className="flex flex-col-reverse w-full" style={{ height: `${h}%` }}>
                  <div
                    className="w-full rounded-t bg-[var(--success)]"
                    style={{ height: total > 0 ? `${(completed / total) * 100}%` : "100%" }}
                  />
                  {failed > 0 && (
                    <div className="w-full bg-[var(--accent)]" style={{ height: `${(failed / total) * 100}%` }} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-1 flex gap-4 text-xs text-[var(--text-disabled)]">
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded bg-[var(--success)]" /> {t("dashboard.completedTasks")}</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded bg-[var(--accent)]" /> {t("dashboard.failedTasks")}</span>
        </div>
      </div>

      {/* Completion Metrics */}
      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-[var(--border)] pt-3">
        <div className="text-center">
          <p className="panel-label">{t("dashboard.avgTime")}</p>
          <p className="mt-1 text-lg text-[var(--text-display)]">{analytics.completion_metrics.avg_seconds}{t("dashboard.seconds")}</p>
        </div>
        <div className="text-center">
          <p className="panel-label">{t("dashboard.p50Time")}</p>
          <p className="mt-1 text-lg text-[var(--text-display)]">{analytics.completion_metrics.p50_seconds}{t("dashboard.seconds")}</p>
        </div>
        <div className="text-center">
          <p className="panel-label">{t("dashboard.p95Time")}</p>
          <p className="mt-1 text-lg text-[var(--text-display)]">{analytics.completion_metrics.p95_seconds}{t("dashboard.seconds")}</p>
        </div>
      </div>

      {/* Success Rate */}
      <div className="mt-3 border-t border-[var(--border)] pt-3">
        <div className="flex items-center justify-between">
          <span className="panel-label">{t("dashboard.successRate")}</span>
          <span className={`text-lg font-medium ${analytics.totals.success_rate >= 95 ? "text-[var(--success)]" : analytics.totals.success_rate >= 80 ? "text-[var(--warning)]" : "text-[var(--accent)]"}`}>
            {analytics.totals.success_rate}%
          </span>
        </div>
        <div className="mt-1 h-2 rounded-full bg-[var(--border)]">
          <div
            className={`h-full rounded-full ${analytics.totals.success_rate >= 95 ? "bg-[var(--success)]" : analytics.totals.success_rate >= 80 ? "bg-[var(--warning)]" : "bg-[var(--accent)]"}`}
            style={{ width: `${analytics.totals.success_rate}%` }}
          />
        </div>
        <div className="mt-1 flex justify-between text-xs text-[var(--text-disabled)]">
          <span>{t("dashboard.totalPeriod")}: {analytics.totals.total}</span>
          <span>{t("dashboard.failedPeriod")}: {analytics.totals.failed}</span>
        </div>
      </div>

      {/* Top Failing Agents */}
      {analytics.top_failing_agents.length > 0 && (
        <div className="mt-3 border-t border-[var(--border)] pt-3">
          <p className="panel-label text-[var(--accent)]">{t("dashboard.topFailingAgents")}</p>
          <div className="mt-2 space-y-1">
            {analytics.top_failing_agents.map((agent) => (
              <div key={agent.agent_id} className="flex items-center justify-between text-sm">
                <span className="text-[var(--text-primary)]">{agent.agent_name}</span>
                <span className="text-[var(--accent)]">{agent.fail_count} {t("dashboard.failCount")}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {analytics.top_failing_agents.length === 0 && (
        <p className="mt-3 border-t border-[var(--border)] pt-3 text-sm text-[var(--success)]">
          ✅ {t("dashboard.noFailingAgents")}
        </p>
      )}
    </div>
  );
}

export function DashboardPage() {
  const { data: overview } = useDashboardOverview();
  const { data: agents } = useAgents();
  const realtime = useRealtimeStore((state) => state.events);
  const currentUser = useSessionStore((state) => state.user);
  const { data: channels } = useDashboardChannels();
  const { t, formatDateTime } = useI18n();
  const liveFeed = realtime.slice(0, 5);

  return (
    <div className="dashboard-page space-y-8">
      <section className="grid gap-6 xl:grid-cols-[0.7fr_1.3fr]">
        <div className="grid gap-6">
          <div className="dashboard-readout-card panel-frame p-4 md:p-5">
            <div>
              <p className="panel-label">{t("dashboard.primaryReadout")}</p>
              <div className="mt-2 flex items-end gap-3">
                <h2 className="font-display text-[clamp(2rem,4.8vw,3.2rem)] leading-[0.9] text-[var(--text-display)]">
                  {overview?.stats.active_agents ?? 0}
                </h2>
                <p className="max-w-[10ch] pb-0.5 text-[11px] leading-4 text-[var(--text-secondary)]">
                  {t("dashboard.activeAgentsLive")}
                </p>
              </div>
            </div>
            <div className="mt-4 border-t border-[var(--border)] pt-3">
              <div className="flex items-center gap-3">
                {currentUser ? <UserAvatar user={currentUser} sizeClass="h-11 w-11 md:h-12 md:w-12" className="shrink-0" /> : null}
                <div className="min-w-0">
                  <p className="panel-label">{t("dashboard.operator")}</p>
                  <p className="mt-1 truncate text-sm leading-4 text-[var(--text-display)]">
                    {currentUser?.display_name ?? t("common.unknown")}
                  </p>
                  <p className="mt-1 text-[10px] uppercase tracking-[0.1em] text-[var(--text-secondary)]">
                    {currentUser?.role ?? "offline"}
                  </p>
                </div>
              </div>
            </div>
            <div className="dashboard-metric-stack mt-4 grid gap-3 border-t border-[var(--border)] pt-3 md:grid-cols-3">
              <div className="dashboard-metric-chip">
                  <p className="panel-label">{t("dashboard.fleet")}</p>
                <p className="mt-1 text-base text-[var(--text-display)]">{overview?.stats.total_agents ?? 0}</p>
              </div>
              <div className="dashboard-metric-chip">
                  <p className="panel-label">{t("dashboard.queue")}</p>
                <p className="mt-1 text-base text-[var(--text-display)]">{overview?.stats.queued_tasks ?? 0}</p>
              </div>
              <div className="dashboard-metric-chip">
                  <p className="panel-label">{t("dashboard.tasks")}</p>
                <p className="mt-1 text-base text-[var(--text-display)]">{overview?.stats.total_tasks ?? 0}</p>
              </div>
            </div>
          </div>

          <div className="dashboard-feed-card panel-frame p-5">
            <div className="flex items-end justify-between gap-4 border-b border-[var(--border)] pb-3">
              <div>
                <p className="panel-label">{t("dashboard.liveFeed")}</p>
                <h3 className="mt-2 text-xl text-[var(--text-display)]">{t("dashboard.runtimeStream")}</h3>
              </div>
              <p className="panel-label">{t("dashboard.lines", { count: liveFeed.length })}</p>
            </div>
            <div className="mt-3 space-y-2">
              {liveFeed.map((event, index) => (
                <div key={`${event.type}-${index}`} className="dashboard-feed-row border-b border-[var(--border)] py-2 last:border-b-0">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-xs uppercase tracking-[0.1em] text-[var(--text-secondary)]">
                      {event.type}
                    </p>
                    <span className={`dashboard-status-badge shrink-0 rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.1em] ${statusBadgeTone(event.status ?? "")}`}>
                      {event.status ?? "stream"}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-[var(--text-primary)]">
                    {event.message ?? event.response ?? t("dashboard.awaitingRuntimeOutput")}
                  </p>
                </div>
              ))}
              {!liveFeed.length ? <p className="panel-inline-status">{t("dashboard.eventStreamIdle")}</p> : null}
            </div>
          </div>
        </div>

        <section className="dashboard-map-card panel-frame p-6">
          <div className="flex items-end justify-between gap-4 border-b border-[var(--border)] pb-4">
            <div>
              <p className="panel-label">{t("dashboard.agentMap")}</p>
              <h3 className="mt-2 text-2xl text-[var(--text-display)]">{t("dashboard.dependencyCanvas")}</h3>
            </div>
            <Link to="/agents" className="panel-button-secondary">
              {t("dashboard.openAgentStudio")}
            </Link>
          </div>
          <div className="mt-4">
            <AgentOrgChart agents={agents ?? []} />
          </div>
        </section>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="dashboard-fleet-card panel-frame p-6">
          <div className="flex items-end justify-between gap-4 border-b border-[var(--border)] pb-4">
            <div>
              <p className="panel-label">{t("dashboard.agents")}</p>
              <h3 className="mt-2 text-2xl text-[var(--text-display)]">{t("dashboard.currentFleet")}</h3>
            </div>
            <Link to="/agents" className="panel-button-secondary">
              {t("dashboard.openAgents")}
            </Link>
          </div>
          <div className="mt-2">
            {agents?.map((agent) => (
              <Link
                key={agent.id}
                to={`/agents/${agent.id}`}
                className="dashboard-agent-row grid gap-3 border-b border-[var(--border)] py-4 md:grid-cols-[1.4fr_1fr_1fr]"
              >
                <div className="flex items-start gap-4">
                  <AgentAvatar agent={agent} sizeClass="h-12 w-12" className="shrink-0" />
                  <div>
                    <p className="panel-label">{agent.slug}</p>
                    <p className="mt-2 text-lg text-[var(--text-display)]">{agent.friendly_name || agent.name}</p>
                    {agent.friendly_name && agent.friendly_name !== agent.name ? (
                      <p className="mt-2 text-sm text-[var(--text-secondary)]">{agent.name}</p>
                    ) : null}
                  </div>
                </div>
                <div>
                  <p className="panel-label">{t("dashboard.model")}</p>
                  <p className="mt-2 text-sm text-[var(--text-primary)]">{agent.model}</p>
                </div>
                <div className="text-left md:text-right">
                  <p className="panel-label">{t("dashboard.status")}</p>
                  <p className={`dashboard-agent-status mt-2 inline-flex rounded-full border px-2.5 py-1 text-sm uppercase tracking-[0.1em] ${statusBadgeTone(agent.status)}`}>
                    {agent.status}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="dashboard-activity-card panel-frame p-6">
          <p className="panel-label">{t("dashboard.recentActivity")}</p>
          <div className="mt-6 space-y-4">
            {overview?.activity.map((item) => (
              <div key={item.id} className="dashboard-activity-row border-b border-[var(--border)] pb-4">
                <p className="panel-label">{item.event_type}</p>
                <p className="mt-2 text-sm text-[var(--text-primary)]">{item.message ?? t("dashboard.noMessage")}</p>
                <p className="mt-2 text-xs uppercase tracking-[0.1em] text-[var(--text-disabled)]">
                  {formatDateTime(item.created_at)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <FleetHealthPanel />
        <TaskAnalyticsPanel />
      </section>

      {channels?.filter((ch) => ch.paired_at).length ? (
      <section className="dashboard-channels-card panel-frame p-6">
        <div className="flex items-end justify-between gap-4 border-b border-[var(--border)] pb-4">
          <div>
            <p className="panel-label">{t("dashboard.channelsTitle")}</p>
            <h3 className="mt-2 text-2xl text-[var(--text-display)]">{t("dashboard.channelsTitle")}</h3>
          </div>
        </div>
        <div className="mt-4">
          {channels?.filter((ch) => ch.paired_at).map((channel) => (
            <div
              key={`${channel.agent_id}-${channel.platform}`}
              className="grid gap-3 border-b border-[var(--border)] py-4 md:grid-cols-[1.4fr_1fr_1fr_1fr]"
            >
              <div>
                <p className="panel-label">{channel.agent_slug}</p>
                <p className="mt-2 text-sm text-[var(--text-display)]">{channel.agent_name}</p>
              </div>
              <div>
                <p className="panel-label">{t("dashboard.platform", { defaultValue: "Platform" })}</p>
                <p className="mt-2 text-sm text-[var(--text-primary)] capitalize">{channel.platform.replace("_", " ")}</p>
              </div>
              <div>
                <p className="panel-label">{t("dashboard.status")}</p>
                <p className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-sm uppercase tracking-[0.1em] ${statusBadgeTone(channel.status)}`}>
                  {channel.status}
                </p>
              </div>
              <div>
                <p className="panel-label">{t("dashboard.connectedSince")}</p>
                <p className="mt-2 flex items-center gap-2 text-sm text-[var(--text-primary)]">
                  <span className="inline-block h-2 w-2 rounded-full bg-[var(--success)]" />
                  {channel.days_since_paired ?? "—"} {t("dashboard.daysConnected")}
                </p>
              </div>
            </div>
          ))}
          {!channels?.filter((ch) => ch.paired_at).length && (
            <p className="py-4 text-sm text-[var(--text-secondary)]">{t("dashboard.noChannelsFound")}</p>
          )}
        </div>
      </section>
      ) : null}
    </div>
  );
}
