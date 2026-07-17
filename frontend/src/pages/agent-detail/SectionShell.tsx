import type { ReactNode } from "react";

import { useI18n } from "../../lib/i18n";

export function SectionShell({
  eyebrow,
  title,
  meta,
  isOpen,
  onToggle,
  children,
}: {
  eyebrow: string;
  title: string;
  meta: string;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <section className="agent-section panel-frame p-6">
      <button
        type="button"
        className="agent-section-toggle flex w-full items-end justify-between gap-4 border-b border-[var(--border)] pb-4 text-left"
        onClick={onToggle}
      >
        <div>
          <p className="panel-label">{eyebrow}</p>
          <h3 className="mt-2 text-2xl text-[var(--text-display)]">{title}</h3>
        </div>
        <div className="text-right">
          <p className="panel-label">{meta}</p>
          <p className="mt-2 font-mono text-xs uppercase tracking-[0.1em] text-[var(--text-secondary)]">
            {isOpen ? t("agent.collapse") : t("agent.expand")}
          </p>
        </div>
      </button>
      {isOpen ? <div className="mt-5">{children}</div> : null}
    </section>
  );
}
