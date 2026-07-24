import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState, useCallback } from "react";

import { useAgents, useAgentAction } from "../../api/agents";
import { useRealtimeStore } from "../../stores/realtimeStore";
import { useV2ToastStore } from "../../v2/toast";

interface PaletteItem {
  id: string;
  label: string;
  hint: string;
  section: string;
  action: () => void;
}

export function V3Shell() {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: agents } = useAgents();
  const startAgent = useAgentAction("start");
  const stopAgent = useAgentAction("stop");
  const toasts = useV2ToastStore((state) => state.toasts);
  const dismissToast = useV2ToastStore((state) => state.dismiss);

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const running = (agents ?? []).filter((a) => a.status === "running").length;
  const errored = (agents ?? []).filter((a) => a.status === "error").length;
  const stopped = (agents ?? []).length - running - errored;

  useRealtimeStore((state) => state.events); // keep WS feed alive

  const paletteItems = useMemo<PaletteItem[]>(() => {
    const items: PaletteItem[] = [
      { id: "nav-overview", label: "Go to Overview", hint: "nav", section: "Navigate", action: () => navigate("/v3") },
      { id: "nav-agents", label: "Go to Agents", hint: "nav", section: "Navigate", action: () => navigate("/v3/agents") },
      { id: "nav-tasks", label: "Go to Tasks", hint: "nav", section: "Navigate", action: () => navigate("/v3/tasks") },
    ];
    for (const agent of agents ?? []) {
      const name = agent.friendly_name || agent.name;
      items.push({
        id: `open-${agent.id}`,
        label: `Open ${name}`,
        hint: agent.status,
        section: "Agents",
        action: () => navigate(`/v3/agents/${agent.id}`),
      });
      if (agent.status === "running") {
        items.push({
          id: `stop-${agent.id}`,
          label: `Stop ${name}`,
          hint: "action",
          section: "Actions",
          action: () => { void stopAgent.mutateAsync(agent.id); },
        });
      } else {
        items.push({
          id: `start-${agent.id}`,
          label: `Start ${name}`,
          hint: "action",
          section: "Actions",
          action: () => { void startAgent.mutateAsync(agent.id); },
        });
      }
    }
    return items;
  }, [agents, navigate, startAgent, stopAgent]);

  const filteredItems = useMemo(() => {
    if (!query.trim()) return paletteItems;
    const q = query.toLowerCase();
    return paletteItems.filter((item) => item.label.toLowerCase().includes(q) || item.hint.toLowerCase().includes(q));
  }, [paletteItems, query]);

  const sections = useMemo(() => {
    const map = new Map<string, PaletteItem[]>();
    for (const item of filteredItems) {
      map.set(item.section, [...(map.get(item.section) ?? []), item]);
    }
    return map;
  }, [filteredItems]);

  const flatItems = useMemo(() => [...sections.values()].flat(), [sections]);

  const closePalette = useCallback(() => {
    setPaletteOpen(false);
    setQuery("");
    setSelectedIndex(0);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen((open) => !open);
        setQuery("");
        setSelectedIndex(0);
      }
      if (e.key === "Escape") {
        closePalette();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closePalette]);

  function onPaletteKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, flatItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && flatItems[selectedIndex]) {
      e.preventDefault();
      flatItems[selectedIndex].action();
      closePalette();
    }
  }

  const railItems = [
    { to: "/v3", label: "OVW", title: "Overview", end: true },
    { to: "/v3/agents", label: "AGT", title: "Agents" },
    { to: "/v3/tasks", label: "TSK", title: "Tasks" },
  ];

  const currentPage =
    location.pathname.startsWith("/v3/tasks") ? "TASKS"
    : location.pathname.startsWith("/v3/agents") ? "AGENTS"
    : "OVERVIEW";

  return (
    <div className="v3-root">
      <div className="v3-layout">
        <aside className="v3-rail">
          <Link to="/v3" className="v3-rail-logo">H</Link>
          {railItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className="v3-rail-btn"
              title={item.title}
              style={({ isActive }) => (isActive ? {
                color: "var(--v3-amber)",
                background: "var(--v3-amber-subtle)",
                borderColor: "rgba(240, 180, 41, 0.25)",
              } : undefined)}
            >
              <span style={{ fontFamily: "var(--v3-font-mono)", fontSize: 9, fontWeight: 600, letterSpacing: "0.05em" }}>
                {item.label}
              </span>
            </NavLink>
          ))}
          <div className="v3-rail-spacer" />
          <button className="v3-rail-kbd" onClick={() => setPaletteOpen(true)} title="Command palette (⌘K)">
            ⌘K
          </button>
        </aside>

        <div className="v3-content">
          <div className="v3-strip">
            <div>
              <div className="v3-strip-title">{currentPage}</div>
              <div className="v3-strip-meta">HermesHQ · Mission Control</div>
            </div>
            <div className="v3-statuslights">
              <span className="v3-statuslight" data-tone="ok">{running} RUN</span>
              <span className="v3-statuslight" data-tone="err">{errored} ERR</span>
              <span className="v3-statuslight" data-tone="idle">{stopped} IDLE</span>
            </div>
          </div>
          <main className="v3-main">
            <Outlet />
          </main>
        </div>
      </div>

      {paletteOpen ? (
        <div className="v3-palette-overlay" onClick={closePalette}>
          <div className="v3-palette" onClick={(e) => e.stopPropagation()}>
            <input
              className="v3-palette-input"
              placeholder="Search agents, actions, pages…"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
              onKeyDown={onPaletteKeyDown}
              autoFocus
            />
            <div className="v3-palette-list">
              {flatItems.length === 0 ? (
                <div className="v3-empty">No results</div>
              ) : (
                [...sections.entries()].map(([section, items]) => (
                  <div key={section}>
                    <div className="v3-palette-section">{section}</div>
                    {items.map((item) => {
                      const index = flatItems.indexOf(item);
                      return (
                        <div
                          key={item.id}
                          className="v3-palette-item"
                          data-selected={index === selectedIndex}
                          onMouseEnter={() => setSelectedIndex(index)}
                          onClick={() => { item.action(); closePalette(); }}
                        >
                          <span className="v3-palette-item-icon">{item.label.slice(0, 1)}</span>
                          <span className="v3-palette-item-label">{item.label}</span>
                          <span className="v3-palette-item-hint">{item.hint}</span>
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
            <div className="v3-palette-footer">
              <span><kbd>↑↓</kbd> navigate</span>
              <span><kbd>↵</kbd> select</span>
              <span><kbd>esc</kbd> close</span>
            </div>
          </div>
        </div>
      ) : null}

      <div className="v3-toast-stack">
        {toasts.map((toast) => (
          <div key={toast.id} className="v3-toast" data-tone={toast.tone} onClick={() => dismissToast(toast.id)}>
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}
