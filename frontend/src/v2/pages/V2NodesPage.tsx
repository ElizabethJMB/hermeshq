import { useNodes } from "../../api/nodes";
import { useAgents } from "../../api/agents";
import { useMemo } from "react";
import { useI18n } from "../../lib/i18n";

function nodeTone(status: string): "success" | "error" | "neutral" {
  if (status === "online" || status === "healthy") return "success";
  if (status === "offline" || status === "error") return "error";
  return "neutral";
}

export function V2NodesPage() {
  const { t } = useI18n();
  const { data: nodes, isLoading } = useNodes();
  const { data: agents } = useAgents();

  const agentsPerNode = useMemo(() => {
    const map = new Map<string, number>();
    for (const agent of agents ?? []) {
      if (agent.node_id) {
        map.set(agent.node_id, (map.get(agent.node_id) ?? 0) + 1);
      }
    }
    return map;
  }, [agents]);

  return (
    <div>
      <div className="v2-page-header">
        <div>
          <h1 className="v2-page-title">{t("v2.nodes")}</h1>
          <p className="v2-page-subtitle">{t("v2.computeNodes")}</p>
        </div>
      </div>

      <section className="v2-card">
        {isLoading ? (
          <div style={{ padding: 20 }}>
            {[1, 2].map((i) => <div key={i} className="v2-skeleton" style={{ height: 56, marginBottom: 8 }} />)}
          </div>
        ) : (nodes ?? []).length === 0 ? (
          <div className="v2-empty">
            <p className="v2-empty-title">{t("v2.noNodes")}</p>
            <p className="v2-empty-text">{t("v2.agentsRunEmbedded")}</p>
          </div>
        ) : (
          <table className="v2-table">
            <thead>
              <tr>
                <th>{t("v2.node")}</th>
                <th>{t("v2.type")}</th>
                <th>{t("v2.statusCol")}</th>
                <th>{t("v2.agents")}</th>
                <th>{t("v2.lastHeartbeat")}</th>
              </tr>
            </thead>
            <tbody>
              {(nodes ?? []).map((node) => (
                <tr key={node.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{node.name}</div>
                    <div className="v2-agent-meta">{node.hostname}</div>
                  </td>
                  <td>
                    <span className="v2-mono" style={{ fontSize: 11.5 }}>{node.node_type}</span>
                  </td>
                  <td>
                    <span className="v2-pill" data-tone={nodeTone(node.status)}>
                      <span className="v2-pill-dot" />
                      {node.status}
                    </span>
                  </td>
                  <td>
                    <span className="v2-mono">{agentsPerNode.get(node.id) ?? 0} / {node.max_agents}</span>
                  </td>
                  <td>
                    <span className="v2-mono" style={{ fontSize: 11.5, color: "var(--v2-text-muted)" }}>
                      {node.last_heartbeat ? new Date(node.last_heartbeat).toLocaleString() : "—"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
