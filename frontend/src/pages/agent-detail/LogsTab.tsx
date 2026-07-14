import type { Dispatch, SetStateAction } from "react";

import { useI18n } from "../../lib/i18n";
import { SectionShell } from "./SectionShell";
import type { ActivityEntry, SectionKey, SectionState } from "./utils";

export function LogsTab({
  flatLogs,
  groupedActivityLogs,
  activityQuery,
  setActivityQuery,
  hasOlderLogs,
  isFetchingOlderLogs,
  fetchOlderLogs,
  sectionState,
  onToggleSection,
}: {
  flatLogs: ActivityEntry[];
  groupedActivityLogs: ActivityEntry[];
  activityQuery: string;
  setActivityQuery: Dispatch<SetStateAction<string>>;
  hasOlderLogs: boolean;
  isFetchingOlderLogs: boolean;
  fetchOlderLogs: () => void;
  sectionState: SectionState;
  onToggleSection: (section: SectionKey) => void;
}) {
  const { t, formatDateTime } = useI18n();
  return (
    <SectionShell
      eyebrow={t("agent.logs")}
      title={t("agent.activityStream")}
      meta={t("agent.events", { count: flatLogs.length })}
      isOpen={sectionState.logs}
      onToggle={() => onToggleSection("logs")}
    >
      <div className="mt-0">
        <label className="panel-field border-b border-[var(--border)] pb-4">
          <span className="panel-label">{t("agent.searchActivityStream")}</span>
          <input
            value={activityQuery}
            onChange={(event) => setActivityQuery(event.target.value)}
            placeholder={t("agent.searchActivityStreamPlaceholder")}
          />
        </label>
        {groupedActivityLogs.length ? (
          <>
            {groupedActivityLogs.map((entry) => (
              <article key={String(entry.id)} className="grid gap-3 border-b border-[var(--border)] py-4 md:grid-cols-[0.45fr_1.55fr]">
                <div>
                  <p className="panel-label">{String(entry.event_type)}</p>
                  <p className="mt-2 text-xs uppercase tracking-[0.1em] text-[var(--text-disabled)]">
                    {formatDateTime(String(entry.created_at))}
                  </p>
                  {typeof entry.grouped_count === "number" && entry.grouped_count > 1 ? (
                    <p className="mt-2 text-xs uppercase tracking-[0.1em] text-[var(--text-disabled)]">
                      {t("agent.groupedFragments", { count: entry.grouped_count })}
                    </p>
                  ) : null}
                </div>
                <div>
                  <p className="text-sm text-[var(--text-primary)]">{String(entry.message ?? "")}</p>
                </div>
              </article>
            ))}
            {hasOlderLogs ? (
              <div className="pt-5">
                <button
                  type="button"
                  className="panel-button-secondary"
                  onClick={() => void fetchOlderLogs()}
                  disabled={isFetchingOlderLogs}
                >
                  {isFetchingOlderLogs ? t("agent.loadingOlderActivity") : t("agent.loadOlderActivity")}
                </button>
              </div>
            ) : (
              <p className="panel-inline-status pt-5">{t("agent.noOlderActivity")}</p>
            )}
          </>
        ) : (
          <p className="panel-inline-status pt-5">{t("agent.noActivityStreamMatches")}</p>
        )}
      </div>
    </SectionShell>
  );
}
