import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { useAgents } from "../../api/agents";
import {
  useCreateScheduledTask,
  useDeleteScheduledTask,
  useRunScheduledTaskNow,
  useScheduledTasks,
  useUpdateScheduledTask,
} from "../../api/scheduledTasks";
import { describeCron, isValidCron } from "../../lib/cron";
import { v2toast, extractErrorMessage } from "../toast";
import type { ScheduledTask } from "../../types/api";

function agentLabel(agent: { friendly_name: string | null; name: string }) {
  return agent.friendly_name || agent.name;
}

interface EditingSchedule {
  id: string;
  name: string;
  cron_expression: string;
  prompt: string;
}

export function V2SchedulesPage() {
  const { data: agents } = useAgents();
  const { data: schedules } = useScheduledTasks();
  const createScheduledTask = useCreateScheduledTask();
  const deleteScheduledTask = useDeleteScheduledTask();
  const updateScheduledTask = useUpdateScheduledTask();
  const runNow = useRunScheduledTaskNow();
  const [searchParams] = useSearchParams();

  const requestedAgentId = searchParams.get("agentId") ?? "";

  const [scheduleAgentId, setScheduleAgentId] = useState("");
  const [scheduleName, setScheduleName] = useState("");
  const [cronExpression, setCronExpression] = useState("*/15 * * * *");
  const [schedulePrompt, setSchedulePrompt] = useState("");
  const [editing, setEditing] = useState<EditingSchedule | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!agents?.length) return;
    setScheduleAgentId((current) => {
      if (requestedAgentId && agents.some((a) => a.id === requestedAgentId)) return requestedAgentId;
      return current || agents[0].id;
    });
  }, [agents, requestedAgentId]);

  const schedulesWithAgent = useMemo(
    () =>
      (schedules ?? []).map((schedule) => ({
        ...schedule,
        agent: (agents ?? []).find((a) => a.id === schedule.agent_id) ?? null,
      })),
    [agents, schedules],
  );

  const visibleSchedules = useMemo(
    () => (requestedAgentId ? schedulesWithAgent.filter((s) => s.agent_id === requestedAgentId) : schedulesWithAgent),
    [requestedAgentId, schedulesWithAgent],
  );

  const cronPreview = useMemo(() => (isValidCron(cronExpression) ? describeCron(cronExpression, "en") : null), [cronExpression]);
  const editingCronPreview = useMemo(
    () => (editing && isValidCron(editing.cron_expression) ? describeCron(editing.cron_expression, "en") : null),
    [editing],
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    if (!isValidCron(cronExpression)) {
      setFormError("Invalid cron expression");
      return;
    }
    try {
      await createScheduledTask.mutateAsync({
        agent_id: scheduleAgentId || agents?.[0]?.id,
        name: scheduleName,
        cron_expression: cronExpression,
        prompt: schedulePrompt,
        enabled: true,
      });
      setScheduleName("");
      setSchedulePrompt("");
      v2toast.success("Schedule created");
    } catch (error) {
      setFormError(extractErrorMessage(error, "Schedule creation failed"));
    }
  }

  async function onToggleEnabled(schedule: ScheduledTask) {
    try {
      await updateScheduledTask.mutateAsync({ id: schedule.id, enabled: !schedule.enabled });
      v2toast.success(schedule.enabled ? "Schedule disabled" : "Schedule enabled");
    } catch (error) {
      v2toast.error(extractErrorMessage(error, "Update failed"));
    }
  }

  async function onRunNow(schedule: ScheduledTask) {
    try {
      await runNow.mutateAsync(schedule.id);
      v2toast.success(`"${schedule.name}" dispatched`);
    } catch (error) {
      v2toast.error(extractErrorMessage(error, "Run failed"));
    }
  }

  async function onSaveEdit() {
    if (!editing) return;
    if (!isValidCron(editing.cron_expression)) {
      v2toast.error("Invalid cron expression");
      return;
    }
    try {
      await updateScheduledTask.mutateAsync({
        id: editing.id,
        name: editing.name,
        cron_expression: editing.cron_expression,
        prompt: editing.prompt,
      });
      setEditing(null);
      v2toast.success("Schedule updated");
    } catch (error) {
      v2toast.error(extractErrorMessage(error, "Update failed"));
    }
  }

  async function onDelete(schedule: ScheduledTask) {
    try {
      await deleteScheduledTask.mutateAsync(schedule.id);
      v2toast.success(`"${schedule.name}" deleted`);
    } catch (error) {
      v2toast.error(extractErrorMessage(error, "Delete failed"));
    }
  }

  return (
    <div>
      <div className="v2-page-header">
        <div>
          <h1 className="v2-page-title">Schedules</h1>
          <p className="v2-page-subtitle">{visibleSchedules.length} recurring tasks configured</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(300px, 380px) 1fr", gap: 20, alignItems: "start" }}>
        <form className="v2-card" onSubmit={onSubmit}>
          <div className="v2-card-header">
            <h2 className="v2-card-title">New schedule</h2>
          </div>
          <div className="v2-card-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="v2-field">
              <label className="v2-field-label">Agent</label>
              <select className="v2-select" value={scheduleAgentId} onChange={(e) => setScheduleAgentId(e.target.value)}>
                <option value="">Select agent…</option>
                {(agents ?? []).map((agent) => (
                  <option key={agent.id} value={agent.id}>{agentLabel(agent)}</option>
                ))}
              </select>
            </div>
            <div className="v2-field">
              <label className="v2-field-label">Name</label>
              <input className="v2-input" value={scheduleName} onChange={(e) => setScheduleName(e.target.value)} required placeholder="Daily news summary" />
            </div>
            <div className="v2-field">
              <label className="v2-field-label">Cron expression</label>
              <input className="v2-input v2-mono" value={cronExpression} onChange={(e) => setCronExpression(e.target.value)} required />
              {cronPreview ? (
                <span className="v2-field-hint" style={{ color: "var(--v2-success)" }}>{cronPreview}</span>
              ) : cronExpression.trim() ? (
                <span className="v2-field-error">Invalid cron expression</span>
              ) : (
                <span className="v2-field-hint">e.g. "0 9 * * 1-5" for weekdays at 09:00</span>
              )}
            </div>
            <div className="v2-field">
              <label className="v2-field-label">Prompt</label>
              <textarea className="v2-textarea" rows={5} value={schedulePrompt} onChange={(e) => setSchedulePrompt(e.target.value)} required placeholder="What should the agent do on each run?" />
            </div>
            {formError ? <p className="v2-field-error">{formError}</p> : null}
            <button type="submit" className="v2-btn v2-btn-primary" disabled={createScheduledTask.isPending}>
              {createScheduledTask.isPending ? "Creating…" : "Create schedule"}
            </button>
          </div>
        </form>

        <section className="v2-card">
          <div className="v2-card-header">
            <h2 className="v2-card-title">Active schedules</h2>
          </div>
          <div>
            {visibleSchedules.length === 0 ? (
              <div className="v2-empty">
                <p className="v2-empty-title">No schedules yet</p>
                <p className="v2-empty-text">Recurring tasks run automatically on their cron schedule.</p>
              </div>
            ) : (
              visibleSchedules.map((schedule) => (
                <div key={schedule.id} style={{ padding: "16px 20px", borderBottom: "1px solid var(--v2-border)" }}>
                  {editing?.id === schedule.id ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      <div className="v2-field">
                        <label className="v2-field-label">Name</label>
                        <input className="v2-input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                      </div>
                      <div className="v2-field">
                        <label className="v2-field-label">Cron</label>
                        <input className="v2-input v2-mono" value={editing.cron_expression} onChange={(e) => setEditing({ ...editing, cron_expression: e.target.value })} />
                        {editingCronPreview ? <span className="v2-field-hint" style={{ color: "var(--v2-success)" }}>{editingCronPreview}</span> : null}
                      </div>
                      <div className="v2-field">
                        <label className="v2-field-label">Prompt</label>
                        <textarea className="v2-textarea" rows={4} value={editing.prompt} onChange={(e) => setEditing({ ...editing, prompt: e.target.value })} />
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button className="v2-btn v2-btn-primary" onClick={() => void onSaveEdit()} disabled={updateScheduledTask.isPending}>Save</button>
                        <button className="v2-btn v2-btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ fontWeight: 620, fontSize: 14.5 }}>{schedule.name}</span>
                          <span className="v2-pill" data-tone={schedule.enabled ? "success" : "neutral"}>
                            <span className="v2-pill-dot" />
                            {schedule.enabled ? "active" : "paused"}
                          </span>
                        </div>
                        <div className="v2-mono" style={{ marginTop: 6, fontSize: 12, color: "var(--v2-text-secondary)" }}>
                          {schedule.cron_expression}
                          <span style={{ color: "var(--v2-success)", marginLeft: 8 }}>{describeCron(schedule.cron_expression, "en")}</span>
                        </div>
                        <p style={{ marginTop: 8, fontSize: 13, color: "var(--v2-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {schedule.prompt}
                        </p>
                        <div className="v2-mono" style={{ marginTop: 8, fontSize: 11, color: "var(--v2-text-muted)" }}>
                          {schedule.agent ? agentLabel(schedule.agent) : schedule.agent_id.slice(0, 8)}
                          {schedule.next_run ? ` · next ${new Date(schedule.next_run).toLocaleString()}` : ""}
                        </div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                        <button className="v2-btn v2-btn-secondary" style={{ padding: "5px 12px", fontSize: 12 }} onClick={() => void onRunNow(schedule)} disabled={runNow.isPending && runNow.variables === schedule.id}>
                          {runNow.isPending && runNow.variables === schedule.id ? "Running…" : "Run now"}
                        </button>
                        <button
                          className="v2-btn v2-btn-secondary"
                          style={{ padding: "5px 12px", fontSize: 12 }}
                          onClick={() => setEditing({ id: schedule.id, name: schedule.name, cron_expression: schedule.cron_expression, prompt: schedule.prompt })}
                        >
                          Edit
                        </button>
                        <button className="v2-btn v2-btn-secondary" style={{ padding: "5px 12px", fontSize: 12 }} onClick={() => void onToggleEnabled(schedule)} disabled={updateScheduledTask.isPending}>
                          {schedule.enabled ? "Disable" : "Enable"}
                        </button>
                        <button className="v2-btn v2-btn-danger" style={{ padding: "5px 12px", fontSize: 12 }} onClick={() => void onDelete(schedule)} disabled={deleteScheduledTask.isPending && deleteScheduledTask.variables === schedule.id}>
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
