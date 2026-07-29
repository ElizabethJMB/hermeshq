import { useMemo, useState } from "react";

import { useAgents } from "../../api/agents";
import { useLogs } from "../../api/logs";
import { useI18n } from "../../lib/i18n";

function severityTone(severity: string): "error" | "warn" | "info" | "neutral" {
  if (severity === "error" || severity === "critical") return "error";
  if (severity === "warning") return "warn";
  if (severity === "info") return "info";
  return "neutral";
}

export function V2AuditPage() {
  const { t } = useI18n();
  const { data: agents } = useAgents();
  const [agentFilter, setAgentFilter] = useState("");
  const [query, setQuery] = useState("");
  const { data: logsPages, fetchNextPage, hasNextPage, isFetchingNextPage } = useLogs(agentFilter || undefined, 100, query);

  const logs = useMemo(() => logsPages?.pages.flatMap((page) => page.items) ?? [], [logsPages]);

  return (
    <div>
      <div className="v2-page-header">
        <div>
          <h1 className="v2-page-title">{t("v2.auditLog")}</h1>
          <p className="v2-page-subtitle">{t("v2.activityAllAgents")}</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <input
            className="v2-input"
            style={{ width: 220 }}
            placeholder={t("v2.searchEvents")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select className="v2-select" style={{ width: 180 }} value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)}>
            <option value="">{t("v2.allAgents")}</option>
            {(agents ?? []).map((agent) => (
              <option key={agent.id} value={agent.id}>{agent.friendly_name || agent.name}</option>
            ))}
          </select>
        </div>
      </div>

      <section className="v2-card">
        <table className="v2-table">
          <thead>
            <tr>
              <th>{t("v2.time")}</th>
              <th>{t("v2.event")}</th>
              <th>{t("v2.message")}</th>
              <th>{t("v2.severity")}</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={4}>
                  <div className="v2-empty">
                    <p className="v2-empty-title">{t("v2.noEvents")}</p>
                  </div>
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id}>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <span className="v2-mono" style={{ fontSize: 11.5, color: "var(--v2-text-muted)" }}>
                      {log.created_at ? new Date(log.created_at).toLocaleString() : "—"}
                    </span>
                  </td>
                  <td>
                    <span className="v2-mono" style={{ fontSize: 11.5 }}>{log.event_type}</span>
                  </td>
                  <td style={{ maxWidth: 420 }}>
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {log.message ?? "—"}
                    </div>
                  </td>
                  <td>
                    <span className="v2-pill" data-tone={severityTone(log.severity ?? "")}>
                      {log.severity ?? "info"}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {hasNextPage ? (
          <div style={{ padding: 14, textAlign: "center", borderTop: "1px solid var(--v2-border)" }}>
            <button className="v2-btn v2-btn-secondary" onClick={() => void fetchNextPage()} disabled={isFetchingNextPage}>
              {isFetchingNextPage ? t("v2.loading") : t("v2.loadOlder")}
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
