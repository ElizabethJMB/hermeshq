import { useMemo, useState } from "react";

import { useAgents } from "../../api/agents";
import { useCancelTask, useDeleteTask, useTasks, useUpdateTaskBoard, useCreateTask } from "../../api/tasks";
import { v2toast, extractErrorMessage } from "../../v2/toast";

function taskTone(status: string): "ok" | "err" | "run" | "warn" | "idle" {
  if (status === "completed") return "ok";
  if (status === "failed" || status === "cancelled") return "err";
  if (status === "running") return "run";
  if (status === "queued") return "warn";
  return "idle";
}

const BOARD_COLUMNS = ["inbox", "assigned", "in_progress", "review", "done", "blocked", "archived"];

export function V3TasksPage() {
  const { data: agents } = useAgents();
  const { data: tasks } = useTasks();
  const createTask = useCreateTask();
  const cancelTask = useCancelTask();
  const deleteTask = useDeleteTask();
  const updateBoard = useUpdateTaskBoard();

  const [agentFilter, setAgentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [prompt, setPrompt] = useState("");
  const [agentId, setAgentId] = useState("");

  const agentsById = useMemo(() => new Map((agents ?? []).map((a) => [a.id, a])), [agents]);

  const filtered = useMemo(() => {
    return [...(tasks ?? [])]
      .filter((t) => (!agentFilter || t.agent_id === agentFilter) && (!statusFilter || t.status === statusFilter))
      .sort((a, b) => new Date(b.queued_at).getTime() - new Date(a.queued_at).getTime());
  }, [tasks, agentFilter, statusFilter]);

  async function handleMove(taskId: string, column: string) {
    try {
      await updateBoard.mutateAsync({ taskId, payload: { board_column: column } });
      v2toast.success(`Moved to ${column}`);
    } catch (error) {
      v2toast.error(extractErrorMessage(error, "Move failed"));
    }
  }

  async function handleCancel(taskId: string) {
    try {
      await cancelTask.mutateAsync(taskId);
      v2toast.success("Task cancelled");
    } catch (error) {
      v2toast.error(extractErrorMessage(error, "Cancel failed"));
    }
  }

  async function handleDelete(taskId: string) {
    try {
      await deleteTask.mutateAsync(taskId);
      v2toast.success("Task deleted");
    } catch (error) {
      v2toast.error(extractErrorMessage(error, "Delete failed"));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || !agentId) return;
    try {
      await createTask.mutateAsync({ agent_id: agentId, prompt: prompt.trim() });
      setPrompt("");
      v2toast.success("Task dispatched");
    } catch (error) {
      v2toast.error(extractErrorMessage(error, "Dispatch failed"));
    }
  }

  return (
    <div>
      <form onSubmit={handleSubmit} className="v3-panel" style={{ padding: 12, marginBottom: 16, display: "flex", gap: 10 }}>
        <select className="v3-select" style={{ width: 200 }} value={agentId} onChange={(e) => setAgentId(e.target.value)} required>
          <option value="">Select agent…</option>
          {(agents ?? []).map((agent) => (
            <option key={agent.id} value={agent.id}>{agent.friendly_name || agent.name}</option>
          ))}
        </select>
        <input
          className="v3-input"
          style={{ flex: 1 }}
          placeholder="Dispatch command…"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          required
        />
        <button type="submit" className="v3-btn v3-btn-primary" disabled={createTask.isPending || !prompt.trim() || !agentId}>
          Dispatch
        </button>
      </form>

      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <select className="v3-select" style={{ width: 180 }} value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)}>
          <option value="">All agents</option>
          {(agents ?? []).map((agent) => (
            <option key={agent.id} value={agent.id}>{agent.friendly_name || agent.name}</option>
          ))}
        </select>
        <select className="v3-select" style={{ width: 160 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="queued">Queued</option>
          <option value="running">Running</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <span style={{ alignSelf: "center", fontFamily: "var(--v3-font-mono)", fontSize: 11, color: "var(--v3-text-dim)", marginLeft: "auto" }}>
          {filtered.length} tasks
        </span>
      </div>

      <section className="v3-panel">
        {filtered.length === 0 ? (
          <div className="v3-empty">No tasks</div>
        ) : (
          <table className="v3-table">
            <thead>
              <tr>
                <th>Task</th>
                <th>Agent</th>
                <th>Status</th>
                <th>Board</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 60).map((task) => {
                const agent = agentsById.get(task.agent_id);
                return (
                  <tr key={task.id}>
                    <td style={{ maxWidth: 320 }}>
                      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 550 }}>
                        {task.title || task.prompt.slice(0, 70)}
                      </div>
                      {task.error_message ? (
                        <div style={{ fontSize: 11, color: "var(--v3-danger)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {task.error_message.slice(0, 80)}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <span style={{ fontFamily: "var(--v3-font-mono)", fontSize: 11, color: "var(--v3-text-dim)" }}>
                        {agent?.friendly_name || agent?.name || task.agent_id.slice(0, 8)}
                      </span>
                    </td>
                    <td>
                      <span className="v3-pill" data-tone={taskTone(task.status)}>{task.status}</span>
                    </td>
                    <td>
                      <select
                        className="v3-select"
                        style={{ fontSize: 11, padding: "3px 6px", width: "auto" }}
                        value={task.board_column ?? "inbox"}
                        onChange={(e) => void handleMove(task.id, e.target.value)}
                      >
                        {BOARD_COLUMNS.map((col) => (
                          <option key={col} value={col}>{col}</option>
                        ))}
                      </select>
                    </td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      {task.status === "running" || task.status === "queued" ? (
                        <button className="v3-btn v3-btn-ghost" style={{ padding: "2px 8px", fontSize: 11 }} onClick={() => void handleCancel(task.id)}>
                          Cancel
                        </button>
                      ) : (
                        <button className="v3-btn v3-btn-ghost" style={{ padding: "2px 8px", fontSize: 11, color: "var(--v3-danger)" }} onClick={() => void handleDelete(task.id)}>
                          Delete
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
