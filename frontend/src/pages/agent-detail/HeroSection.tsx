import { Link } from "react-router-dom";

import { AgentAvatar } from "../../components/AgentAvatar";
import { useI18n } from "../../lib/i18n";
import type { Agent } from "../../types/api";
import { statusBadgeTone } from "./utils";

export function HeroSection({
  agent,
  archived,
  isAdmin,
  startPending,
  stopPending,
  deletePending,
  generateAvatarPending,
  generateAIAvatarPending,
  removeAvatarPending,
  onStart,
  onStop,
  onDelete,
  onGenerateAvatar,
  onGenerateAIAvatar,
  onAvatarSelected,
  onRemoveAvatar,
}: {
  agent: Agent;
  archived: boolean;
  isAdmin: boolean;
  startPending: boolean;
  stopPending: boolean;
  deletePending: boolean;
  generateAvatarPending: boolean;
  generateAIAvatarPending: boolean;
  removeAvatarPending: boolean;
  onStart: () => void;
  onStop: () => void;
  onDelete: () => void;
  onGenerateAvatar: () => void;
  onGenerateAIAvatar: () => void;
  onAvatarSelected: (file: File | null) => void;
  onRemoveAvatar: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="agent-hero panel-frame p-8">
      <p className="panel-label">{agent.slug}</p>
      <div className="mt-6 grid gap-8 md:grid-cols-[1fr_auto]">
        <div>
          <h2 className="text-[clamp(2.5rem,6vw,4.5rem)] leading-[0.95] text-[var(--text-display)]">
            {agent.friendly_name || agent.name}
          </h2>
          <p className="mt-3 text-sm uppercase tracking-[0.1em] text-[var(--text-secondary)]">
            {agent.name} / {agent.slug}
          </p>
          <p className="mt-4 max-w-[34rem] text-base leading-7 text-[var(--text-secondary)]">
            {agent.description ?? t("agent.noDescription")}
          </p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <AgentAvatar agent={agent} sizeClass="h-28 w-28" />
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="panel-button-secondary"
              onClick={() => void onGenerateAvatar()}
              disabled={generateAvatarPending}
            >
              {generateAvatarPending ? t("agent.avatarGenerating") : t("agent.generateAvatar")}
            </button>
            <button
              type="button"
              className="panel-button-secondary"
              onClick={() => void onGenerateAIAvatar()}
              disabled={generateAIAvatarPending}
              title={t("agent.generateAvatarAIHint")}
            >
              {generateAIAvatarPending ? t("agent.avatarGenerating") : t("agent.generateAvatarAI")}
            </button>
            <label className="panel-button-secondary cursor-pointer">
              {t("agent.uploadAvatar")}
              <input
                className="hidden"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => void onAvatarSelected(event.target.files?.[0] ?? null)}
              />
            </label>
            <button
              type="button"
              className="panel-button-secondary"
              onClick={() => void onRemoveAvatar()}
              disabled={!agent.has_avatar || removeAvatarPending}
            >
              {t("agent.remove")}
            </button>
          </div>
        </div>
      </div>

      <div className="mt-10 grid gap-6 border-t border-[var(--border)] pt-6 md:grid-cols-4">
        <div className="agent-hero-metric">
          <p className="panel-label">{t("dashboard.status")}</p>
          <p className={`agent-status-pill mt-2 inline-flex rounded-full border px-3 py-1.5 text-lg uppercase tracking-[0.1em] ${statusBadgeTone(agent.status)}`}>
            {agent.status}
          </p>
          {archived ? (
            <p className="mt-2 text-xs uppercase tracking-[0.1em] text-[var(--accent)]">
              {t("agent.archived")}
            </p>
          ) : null}
        </div>
        <div className="agent-hero-metric">
          <p className="panel-label">{t("agent.mode")}</p>
          <p className="mt-2 text-lg text-[var(--text-display)]">{agent.run_mode}</p>
        </div>
        <div className="agent-hero-metric">
          <p className="panel-label">{t("dashboard.tasks")}</p>
          <p className="mt-2 text-lg text-[var(--text-display)]">{agent.total_tasks}</p>
        </div>
        <div className="agent-hero-metric">
          <p className="panel-label">{t("agent.tokens")}</p>
          <p className="mt-2 text-lg text-[var(--text-display)]">{agent.total_tokens_used}</p>
        </div>
      </div>

      {archived ? (
        <div className="mt-6 border border-[var(--accent)] bg-[var(--accent-subtle)] px-4 py-3 text-sm text-[var(--text-primary)]">
          {t("agent.archivedBanner")}
        </div>
      ) : null}

      <div className="mt-8 flex flex-wrap gap-3">
        <button className="panel-button-primary" onClick={onStart} disabled={archived || startPending || stopPending}>
          {t("agent.startRuntime")}
        </button>
        <button className="panel-button-secondary" onClick={onStop} disabled={archived || startPending || stopPending}>
          {t("agent.stopRuntime")}
        </button>
        <Link className="panel-button-secondary" to={`/schedules?agentId=${agent.id}`}>
          {t("nav.schedules")}
        </Link>
        {isAdmin ? (
          <button
            className={`panel-button-secondary ${archived ? "border-red-500 text-red-500" : "border-[var(--accent)] text-[var(--accent)]"}`}
            onClick={onDelete}
            disabled={deletePending}
          >
            {archived ? t("agent.permanentDelete") : t("agent.delete")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
