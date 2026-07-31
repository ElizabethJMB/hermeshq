import { Link, NavLink, Outlet } from "react-router-dom";
import { useEffect, useState } from "react";

import { useFleetHealth } from "../../api/dashboard";
import { useAgents } from "../../api/agents";
import { usePublicBranding, resolveAssetUrl } from "../../api/settings";
import { useI18n } from "../../lib/i18n";
import { useSessionStore } from "../../stores/sessionStore";
import { useV2ToastStore } from "../toast";

type V2Theme = "paper" | "slate" | "enterprise";

const THEME_LABELS: Record<V2Theme, string> = {
  paper: "Paper",
  slate: "Slate",
  enterprise: "Corp",
};

export function V2Shell() {
  const [theme, setTheme] = useState<V2Theme>(() => {
    return (localStorage.getItem("v2.theme") as V2Theme) || "enterprise";
  });
  const { t } = useI18n();
  const { data: branding } = usePublicBranding();
  const appName = branding?.app_name || "HermesHQ";
  const logoUrl = resolveAssetUrl(branding?.logo_url);
  const appShortName = branding?.app_short_name || appName.slice(0, 2);
  const { data: health } = useFleetHealth();
  const { data: agents } = useAgents();
  const currentUser = useSessionStore((state) => state.user);
  const toasts = useV2ToastStore((state) => state.toasts);
  const dismissToast = useV2ToastStore((state) => state.dismiss);

  useEffect(() => {
    localStorage.setItem("v2.theme", theme);
  }, [theme]);

  const errorAgents = (agents ?? []).filter((a) => a.status === "error").length;
  const recentErrors = health?.recent_errors?.length ?? 0;
  const healthTone = errorAgents > 0 || recentErrors > 0 ? "error" : "success";
  const healthText = errorAgents > 0
    ? `${errorAgents} agent${errorAgents > 1 ? "s" : ""} down`
    : recentErrors > 0
      ? `${recentErrors} recent errors`
      : "All systems OK";

  const navItems = [
    { to: "/v2", label: t("nav.overview"), end: true },
    { to: "/v2/agents", label: t("nav.agents") },
    { to: "/v2/builder", label: "✨ Builder" },
    { to: "/v2/tasks", label: t("nav.tasks") },
    { to: "/v2/schedules", label: t("nav.schedules") },
    { to: "/v2/comms", label: t("nav.comms") },
    { to: "/v2/audit", label: t("nav.audit") },
    { to: "/v2/users", label: t("nav.users") },
    { to: "/v2/settings", label: t("nav.settings") },
  ];

  return (
    <div className="v2-root" data-v2theme={theme}>
      <header className="v2-topbar">
        <div className="v2-topbar-inner">
          <Link to="/v2" className="v2-brand">
            {logoUrl ? (
              <img src={logoUrl} alt={appName} style={{ height: 24, maxWidth: 140, objectFit: "contain", borderRadius: 4 }} />
            ) : (
              <span className="v2-brand-mark">{appShortName.slice(0, 1)}</span>
            )}
            {appName}
          </Link>
          <nav className="v2-nav">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className="v2-nav-link"
                style={({ isActive }) => (isActive ? { color: "var(--v2-text)", background: "var(--v2-bg-sunken)", fontWeight: 600 } : undefined)}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <Link to="/v2/agents" className="v2-health" data-tone={healthTone}>
            <span className="v2-health-dot" />
            {healthText}
          </Link>
          <div className="v2-theme-switcher">
            {(Object.keys(THEME_LABELS) as V2Theme[]).map((t) => (
              <button
                key={t}
                className="v2-theme-btn"
                data-active={theme === t}
                onClick={() => setTheme(t)}
              >
                {THEME_LABELS[t]}
              </button>
            ))}
          </div>
          <Link to="/v2/account" className="v2-agent-avatar" style={{ width: 30, height: 30, fontSize: 12, textDecoration: "none" }} title="My account">
            {(currentUser?.display_name || currentUser?.username || "U").slice(0, 1).toUpperCase()}
          </Link>
        </div>
      </header>

      <main className="v2-page">
        <Outlet context={{ theme }} />
      </main>

      <footer style={{ borderTop: "1px solid var(--v2-border)", padding: "14px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", maxWidth: 1440, margin: "0 auto" }}>
        <span style={{ fontSize: 12, color: "var(--v2-text-muted)" }}>{appName}</span>
        <div style={{ display: "flex", gap: 16 }}>
          <Link to="/manual" style={{ fontSize: 12, color: "var(--v2-text-secondary)", textDecoration: "none" }}>{t("nav.manual")}</Link>
          <Link to="/" style={{ fontSize: 12, color: "var(--v2-text-secondary)", textDecoration: "none" }}>V1</Link>
        </div>
      </footer>

      <div className="v2-toast-stack">
        {toasts.map((toast) => (
          <div key={toast.id} className="v2-toast" data-tone={toast.tone} onClick={() => dismissToast(toast.id)}>
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}
