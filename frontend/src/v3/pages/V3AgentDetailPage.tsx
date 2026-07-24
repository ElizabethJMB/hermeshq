import { FormEvent, useMemo, useRef, useState, useEffect } from "react";
import { Link, useParams } from "react-router-dom";

import { useAgent, useAgentAction } from "../../api/agents";
import { useTasks, useCreateTask } from "../../api/tasks";
import { MarkdownText } from "../../components/MarkdownText";
import { v2toast, extractErrorMessage } from "../../v2/toast";

function statusTone(status: string): "ok" | "err" | "idle" {
  if (status === "running") return "ok";
  if (status === "error") return "err";
  return "idle";
}

export function V3AgentDetailPage() {
  const { agentId = "" } = useParams();
  const { data: agent, isLoading } = useAgent(agentId);
  const { data: tasks } = useTasks(agentId);
  const startAgent = useAgentAction("start");
  const stopAgent = useAgentAction("stop");
  const createTask = useCreateTask();

  const [prompt, setPrompt] = useState("");
  const feedRef = useRef<HTMLDivElement | null>(null);
  const nearBottomRef = useRef(true);

  const sortedTasks = useMemo(
    () => [...(tasks ?? [])].sort((a, b) => new Date(a.queued_at).getTime() - new Date(b.queued_at).getTime()),
    [tasks],
  );

  useEffect(() => {
    const node = feedRef.current;
    if (node && nearBottomRef.current) {
      node.scrollTop = node.scrollHeight;
    }
  }, [sortedTasks.length]);

  function handleScroll() {
    const node = feedRef.current;
    if (!node) return;
    nearBottomRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || !agent) return;
    const text = prompt.trim();
    setPrompt("");
    try {
      if (agent.status !== "running") {
        await startAgent.mutateAsync(agent.id);
      }
      await createTask.mutateAsync({
        agent_id: agent.id,
        prompt: text,
        metadata: { conversation: true, thread_id: `console_${agent.id}` },
      });
      nearBottomRef.current = true;
      v2toast.success("Message sent");
    } catch (error) {
      setPrompt(text);
      v2toast.error(extractErrorMessage(error, "Send failed"));
    }
  }

  if (isLoading) {
    return (
      <div style={{ padding: 40 }}>
        <div className="v3-skeleton" style={{ height: 28, width: 240, marginBottom: 12 }} />
        <div className="v3-skeleton" style={{ height: 400 }} />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="v3-empty">
        Agent not found · <Link to="/v3/agents" style={{ color: "var(--v3-amber)" }}>back</Link>
      </div>
    );
  }

  const name = agent.friendly_name || agent.name;
  const isRunning = agent.status === "running";

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Link to="/v3/agents" style={{ fontFamily: "var(--v3-font-mono)", fontSize: 11, color: "var(--v3-text-dim)", textDecoration: "none" }}>
          ← AGENTS
        </Link>
      </div>

      <div className="v3-panel" style={{ marginBottom: 16 }}>
        <div className="v3-panel-header">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontFamily: "var(--v3-font-display)", fontSize: 17, fontWeight: 650 }}>{name}</span>
            <span className="v3-pill" data-tone={statusTone(agent.status)}>{agent.status}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontFamily: "var(--v3-font-mono)", fontSize: 10.5, color: "var(--v3-text-dim)" }}>
              {agent.model ?? agent.provider} · {agent.runtime_profile ?? "standard"}
            </span>
            {isRunning ? (
              <button className="v3-btn v3-btn-outline" style={{ padding: "5px 12px", fontSize: 12 }} disabled={stopAgent.isPending} onClick={() => void stopAgent.mutateAsync(agent.id)}>
                Stop
              </button>
            ) : (
              <button className="v3-btn v3-btn-primary" style={{ padding: "5px 12px", fontSize: 12 }} disabled={startAgent.isPending} onClick={() => void startAgent.mutateAsync(agent.id)}>
                Start
              </button>
            )}
          </div>
        </div>

        <div
          ref={feedRef}
          onScroll={handleScroll}
          className="v3-chatlog"
          style={{ height: "56vh", overflowY: "auto", padding: "8px 20px" }}
        >
          {sortedTasks.length === 0 ? (
            <div className="v3-empty">No activity · send first command</div>
          ) : (
            sortedTasks.flatMap((task) => {
              const items = [
                <div key={`${task.id}-u`} className="v3-chatline" data-role="user">
                  <span className="v3-chatline-prefix">operator</span>
                  <div className="v3-chatline-body">{task.prompt}</div>
                  <div className="v3-chatline-meta">
                    <span>{task.status}</span>
                  </div>
                </div>,
              ];
              const response = task.response || task.error_message || (task.status === "running" ? "Running…" : task.status === "queued" ? "Queued…" : "");
              if (response) {
                items.push(
                  <div key={`${task.id}-a`} className="v3-chatline" data-role={task.status === "failed" ? "system" : "assistant"}>
                    <span className="v3-chatline-prefix">{task.status === "failed" ? "error" : "agent"}</span>
                    <div className="v3-chatline-body">
                      {task.status === "failed" ? task.error_message : <MarkdownText>{response}</MarkdownText>}
                    </div>
                    {task.status === "failed" ? (
                      <div className="v3-chatline-meta">
                        <button
                          className="v3-btn v3-btn-ghost"
                          style={{ padding: "1px 8px", fontSize: 10.5, color: "var(--v3-danger)" }}
                          onClick={() => { setPrompt(task.prompt); nearBottomRef.current = true; }}
                        >
                          retry ↻
                        </button>
                      </div>
                    ) : null}
                  </div>,
                );
              }
              return items;
            })
          )}
        </div>

        <form onSubmit={handleSubmit} style={{ padding: 12, borderTop: "1px solid var(--v3-border)", display: "flex", gap: 10 }}>
          <input
            className="v3-input"
            style={{ flex: 1 }}
            placeholder={`command ${name}…`}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <button type="submit" className="v3-btn v3-btn-primary" disabled={createTask.isPending || !prompt.trim()}>
            Send
          </button>
        </form>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Link to={`/agents/${agent.id}`} className="v3-btn v3-btn-ghost" style={{ fontSize: 11.5 }}>
          Full settings in classic view →
        </Link>
      </div>
    </div>
  );
}
