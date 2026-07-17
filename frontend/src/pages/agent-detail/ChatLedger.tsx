import type { Dispatch, SetStateAction } from "react";

import { AgentConversationPanel } from "../../components/AgentConversationPanel";
import { useI18n } from "../../lib/i18n";
import type { Agent, RuntimeLedgerEntry, Task } from "../../types/api";
import { SectionShell } from "./SectionShell";
import {
  ledgerChannelLabel,
  ledgerChannelTone,
  ledgerDirectionLabel,
  type SectionKey,
  type SectionState,
} from "./utils";

export function ChatLedger({
  agent,
  archived,
  agentTasks,
  onSendInstruction,
  createTaskPending,
  runtimeLedger,
  filteredLedgerEntries,
  ledgerQuery,
  setLedgerQuery,
  sectionState,
  onToggleSection,
}: {
  agent: Agent;
  archived: boolean;
  agentTasks: Task[];
  onSendInstruction: (prompt: string) => Promise<void>;
  createTaskPending: boolean;
  runtimeLedger: RuntimeLedgerEntry[] | undefined;
  filteredLedgerEntries: RuntimeLedgerEntry[];
  ledgerQuery: string;
  setLedgerQuery: Dispatch<SetStateAction<string>>;
  sectionState: SectionState;
  onToggleSection: (section: SectionKey) => void;
}) {
  const { t, formatDateTime } = useI18n();
  return (
    <>
      <SectionShell
        eyebrow={t("agent.conversation")}
        title={t("agent.talkToAgent")}
        meta={archived ? t("agent.archived") : agent.status === "running" ? t("agent.liveRuntime") : t("agent.autoStartOnSend")}
        isOpen={sectionState.conversation}
        onToggle={() => onToggleSection("conversation")}
      >
        <AgentConversationPanel
          tasks={agentTasks}
          agentStatus={agent.status}
          onSubmit={onSendInstruction}
          isSubmitting={createTaskPending}
          disabled={archived}
          embedded
        />
      </SectionShell>

      <SectionShell
        eyebrow={t("agent.taskHistory")}
        title={t("agent.runtimeLedger")}
        meta={t("agent.records", { count: runtimeLedger?.length ?? 0 })}
        isOpen={sectionState.ledger}
        onToggle={() => onToggleSection("ledger")}
      >
        <div className="mt-0">
          <label className="panel-field border-b border-[var(--border)] pb-4">
            <span className="panel-label">{t("agent.searchRuntimeLedger")}</span>
            <input
              value={ledgerQuery}
              onChange={(event) => setLedgerQuery(event.target.value)}
              placeholder={t("agent.searchRuntimeLedgerPlaceholder")}
            />
          </label>
          {filteredLedgerEntries.length ? (
            filteredLedgerEntries.map((entry) => (
              <article key={entry.id} className="grid gap-4 border-b border-[var(--border)] py-5 md:grid-cols-[0.7fr_1.3fr]">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2 py-1 font-mono text-[11px] uppercase tracking-[0.08em] ${ledgerChannelTone(entry.channel)}`}>
                      {ledgerChannelLabel(entry.channel)}
                    </span>
                    <span className="rounded-full border border-[var(--border)] px-2 py-1 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--text-secondary)]">
                      {ledgerDirectionLabel(entry.direction, t)}
                    </span>
                    {entry.status ? (
                      <span className="panel-label">{entry.status}</span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm text-[var(--text-primary)]">{entry.title ?? entry.entry_type}</p>
                  {entry.counterpart_label ? (
                    <p className="mt-2 text-xs uppercase tracking-[0.1em] text-[var(--text-disabled)]">
                      {t("agent.ledgerCounterpart")}: {entry.counterpart_label}
                    </p>
                  ) : null}
                  <p className="mt-2 text-xs uppercase tracking-[0.1em] text-[var(--text-disabled)]">
                    {formatDateTime(entry.created_at)}
                  </p>
                </div>
                <div>
                  <p className="text-sm leading-6 text-[var(--text-secondary)]">{entry.content || t("common.unknown")}</p>
                </div>
              </article>
            ))
          ) : (
            <p className="panel-inline-status pt-5">{t("agent.noRuntimeLedgerMatches")}</p>
          )}
        </div>
      </SectionShell>
    </>
  );
}
