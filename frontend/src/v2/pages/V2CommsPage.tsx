import { FormEvent, useMemo, useState } from "react";

import { useAgents } from "../../api/agents";
import { useBroadcast, useCommsHistory, useCommsTopology, useSendMessage } from "../../api/comms";
import { v2toast, extractErrorMessage } from "../toast";
import { useI18n } from "../../lib/i18n";

function agentLabel(agent: { friendly_name: string | null; name: string }) {
  return agent.friendly_name || agent.name;
}

export function V2CommsPage() {
  const { t } = useI18n();
  const { data: agents } = useAgents();
  const { data: topology } = useCommsTopology();
  const { data: history } = useCommsHistory();
  const sendMessage = useSendMessage();
  const broadcast = useBroadcast();

  const [messageType, setMessageType] = useState<"direct" | "delegate" | "broadcast">("direct");
  const [fromAgentId, setFromAgentId] = useState("");
  const [toAgentId, setToAgentId] = useState("");
  const [teamTag, setTeamTag] = useState("");
  const [content, setContent] = useState("");
  const [historyAgentFilter, setHistoryAgentFilter] = useState("");

  const agentMap = useMemo(() => new Map((agents ?? []).map((a) => [a.id, a])), [agents]);
  const teamTags = useMemo(
    () => [...new Set((agents ?? []).flatMap((a) => a.team_tags ?? []))],
    [agents],
  );

  const aggregatedEdges = useMemo(() => {
    const map = new Map<string, { source: string; target: string; total: number; delegate: number; direct: number; broadcast: number }>();
    for (const edge of topology?.edges ?? []) {
      const key = `${edge.source}->${edge.target}`;
      const entry = map.get(key) ?? { source: edge.source, target: edge.target, total: 0, delegate: 0, direct: 0, broadcast: 0 };
      entry.total += 1;
      if (edge.type === "delegate") entry.delegate += 1;
      else if (edge.type === "broadcast") entry.broadcast += 1;
      else entry.direct += 1;
      map.set(key, entry);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [topology]);

  const filteredHistory = useMemo(() => {
    const messages = history ?? [];
    if (!historyAgentFilter) return messages;
    return messages.filter((m) => m.from_agent_id === historyAgentFilter || m.to_agent_id === historyAgentFilter);
  }, [history, historyAgentFilter]);

  useMemo(() => {
    if (!fromAgentId && agents?.length) setFromAgentId(agents[0].id);
  }, [agents, fromAgentId]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      if (messageType === "broadcast") {
        await broadcast.mutateAsync({ from_agent_id: fromAgentId, team_tag: teamTag, content });
        v2toast.success(t("v2.broadcastSent", { tag: teamTag }));
      } else {
        await sendMessage.mutateAsync({
          from_agent_id: fromAgentId,
          to_agent_id: toAgentId,
          message_type: messageType,
          content,
        });
        v2toast.success(messageType === "delegate" ? t("v2.taskDelegated") : t("v2.messageSent"));
      }
      setContent("");
    } catch (error) {
      v2toast.error(extractErrorMessage(error, t("v2.sendFailed")));
    }
  }

  const isPending = sendMessage.isPending || broadcast.isPending;

  const messageTypeLabels: Record<string, string> = {
    direct: t("v2.direct"),
    delegate: t("v2.delegate"),
    broadcast: t("v2.broadcast"),
  };

  return (
    <div>
      <div className="v2-page-header">
        <div>
          <h1 className="v2-page-title">{t("v2.comms")}</h1>
          <p className="v2-page-subtitle">{t("v2.interAgentMessaging")}</p>
        </div>
      </div>

      <div className="v2-grid-2" style={{ alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <form className="v2-card" onSubmit={onSubmit}>
            <div className="v2-card-header">
              <h2 className="v2-card-title">{t("v2.dispatchTitle")}</h2>
            </div>
            <div className="v2-card-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", gap: 6 }}>
                {(["direct", "delegate", "broadcast"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    className={messageType === type ? "v2-btn v2-btn-primary" : "v2-btn v2-btn-secondary"}
                    style={{ padding: "6px 12px", fontSize: 12.5, textTransform: "capitalize" }}
                    onClick={() => setMessageType(type)}
                  >
                    {messageTypeLabels[type]}
                  </button>
                ))}
              </div>

              <div className="v2-field">
                <label className="v2-field-label">{t("v2.from")}</label>
                <select className="v2-select" value={fromAgentId} onChange={(e) => setFromAgentId(e.target.value)} required>
                  <option value="">{t("v2.selectSender")}</option>
                  {(agents ?? []).map((agent) => (
                    <option key={agent.id} value={agent.id}>{agentLabel(agent)}</option>
                  ))}
                </select>
              </div>

              {messageType === "broadcast" ? (
                <div className="v2-field">
                  <label className="v2-field-label">{t("v2.teamTag")}</label>
                  <select className="v2-select" value={teamTag} onChange={(e) => setTeamTag(e.target.value)} required>
                    <option value="">{t("v2.selectTeam")}</option>
                    {teamTags.map((tag) => (
                      <option key={tag} value={tag}>{tag}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="v2-field">
                  <label className="v2-field-label">{t("v2.to")}</label>
                  <select className="v2-select" value={toAgentId} onChange={(e) => setToAgentId(e.target.value)} required>
                    <option value="">{t("v2.selectRecipient")}</option>
                    {(agents ?? []).filter((a) => a.id !== fromAgentId).map((agent) => (
                      <option key={agent.id} value={agent.id}>{agentLabel(agent)}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="v2-field">
                <label className="v2-field-label">{t("v2.message")}</label>
                <textarea className="v2-textarea" rows={4} value={content} onChange={(e) => setContent(e.target.value)} required />
              </div>

              <button type="submit" className="v2-btn v2-btn-primary" disabled={isPending || !content.trim() || !fromAgentId || (messageType === "broadcast" ? !teamTag : !toAgentId)}>
                {isPending ? t("v2.sending") : messageType === "broadcast" ? t("v2.broadcastBtn") : messageType === "delegate" ? t("v2.delegateTask") : t("v2.sendMessage")}
              </button>
            </div>
          </form>

          <section className="v2-card">
            <div className="v2-card-header">
              <h2 className="v2-card-title">{t("v2.trafficByRoute")}</h2>
            </div>
            <div className="v2-card-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {aggregatedEdges.length === 0 ? (
                <p style={{ fontSize: 13, color: "var(--v2-text-muted)" }}>{t("v2.noInterAgentTraffic")}</p>
              ) : (
                aggregatedEdges.map((edge) => {
                  const sourceLabel = topology?.nodes.find((n) => n.id === edge.source)?.label ?? edge.source;
                  const targetLabel = topology?.nodes.find((n) => n.id === edge.target)?.label ?? edge.target;
                  return (
                    <div key={`${edge.source}->${edge.target}`} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span className="v2-pill" data-tone="neutral">{sourceLabel}</span>
                      <span style={{ color: "var(--v2-text-muted)" }}>→</span>
                      <span className="v2-pill" data-tone="neutral">{targetLabel}</span>
                      <span className="v2-mono" style={{ marginLeft: "auto", fontSize: 12, color: "var(--v2-text-secondary)" }}>
                        {edge.total} {t("v2.msgs")} · {edge.delegate} del / {edge.direct} dir / {edge.broadcast} bc
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>

        <section className="v2-card">
          <div className="v2-card-header">
            <h2 className="v2-card-title">{t("v2.messageHistory")}</h2>
            <select
              className="v2-select"
              style={{ width: 180, padding: "5px 10px", fontSize: 12.5 }}
              value={historyAgentFilter}
              onChange={(e) => setHistoryAgentFilter(e.target.value)}
            >
              <option value="">{t("v2.allAgents")}</option>
              {(agents ?? []).map((agent) => (
                <option key={agent.id} value={agent.id}>{agentLabel(agent)}</option>
              ))}
            </select>
          </div>
          <div style={{ maxHeight: 560, overflowY: "auto" }}>
            {filteredHistory.length === 0 ? (
              <div className="v2-empty">
                <p className="v2-empty-title">{t("v2.noMessages")}</p>
                <p className="v2-empty-text">{t("v2.interAgentMsgsAppear")}</p>
              </div>
            ) : (
              filteredHistory.map((message) => {
                const fromAgent = agentMap.get(message.from_agent_id);
                const toAgent = agentMap.get(message.to_agent_id);
                const typeTone =
                  message.message_type === "broadcast" ? "info"
                  : message.message_type === "delegate" ? "warn"
                  : "neutral";
                return (
                  <div key={message.id} style={{ padding: "12px 20px", borderBottom: "1px solid var(--v2-border)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span className="v2-pill" data-tone="neutral" style={{ fontWeight: 620 }}>
                        {fromAgent ? agentLabel(fromAgent) : message.from_agent_id.slice(0, 8)}
                      </span>
                      <span style={{ color: "var(--v2-text-muted)", fontSize: 12 }}>→</span>
                      <span className="v2-pill" data-tone="neutral" style={{ fontWeight: 620 }}>
                        {toAgent ? agentLabel(toAgent) : message.to_agent_id.slice(0, 8)}
                      </span>
                      <span className="v2-pill" data-tone={typeTone}>{message.message_type}</span>
                      <span className="v2-mono" style={{ marginLeft: "auto", fontSize: 11, color: "var(--v2-text-muted)" }}>
                        {new Date(message.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p style={{ marginTop: 8, fontSize: 13, color: "var(--v2-text-primary)" }}>{message.content}</p>
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
