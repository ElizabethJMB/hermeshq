import { useMemo, useState } from "react";

/* ============================================================
   V2 Charts — pure SVG, no dependencies
   LineChart / AreaChart / DonutChart / BarChart / Sparkline
   ============================================================ */

export interface SeriesPoint {
  label: string;
  value: number;
}

export interface LineSeries {
  name: string;
  color: string;
  points: SeriesPoint[];
}

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(value)));
  const norm = value / pow;
  if (norm <= 1) return pow;
  if (norm <= 2) return 2 * pow;
  if (norm <= 5) return 5 * pow;
  return 10 * pow;
}

/* ── AreaChart (stacked-capable, smooth) ──────────────────── */

export function AreaChart({
  series,
  height = 180,
  stacked = false,
  formatValue = (v: number) => String(Math.round(v)),
}: {
  series: LineSeries[];
  height?: number;
  stacked?: boolean;
  formatValue?: (v: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const { paths, labels, gridLines, totals } = useMemo(() => {
    const labels = series[0]?.points.map((p) => p.label) ?? [];
    const maxSingle = Math.max(
      1,
      ...series.flatMap((s) => s.points.map((p) => p.value)),
    );
    const maxStack = Math.max(
      1,
      ...labels.map((_, i) => series.reduce((sum, s) => sum + (s.points[i]?.value ?? 0), 0)),
    );
    const max = niceMax(stacked ? maxStack : maxSingle);
    const totals = labels.map((_, i) => series.reduce((sum, s) => sum + (s.points[i]?.value ?? 0), 0));

    const width = 100;
    const xStep = labels.length > 1 ? width / (labels.length - 1) : width;

    const paths = series.map((s, si) => {
      const pts = s.points.map((p, i) => {
        const x = i * xStep;
        let base = 0;
        if (stacked) {
          for (let j = 0; j < si; j++) base += series[j].points[i]?.value ?? 0;
        }
        const y = 100 - ((base + p.value) / max) * 100;
        const yBase = 100 - (base / max) * 100;
        return { x, y, yBase };
      });
      const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
      const area =
        pts.length > 0
          ? `${line} L${pts[pts.length - 1].x.toFixed(2)},${pts[pts.length - 1].yBase.toFixed(2)} ${[...pts].reverse().map((p) => `L${p.x.toFixed(2)},${p.yBase.toFixed(2)}`).join(" ")} Z`
          : "";
      return { line, area, color: s.color, name: s.name };
    });

    const gridLines = [0, 0.5, 1].map((f) => ({ y: 100 - f * 100, value: max * f }));

    return { paths, labels, max, gridLines, totals };
  }, [series, stacked]);

  return (
    <div style={{ position: "relative" }}>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{ width: "100%", height, display: "block" }}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const frac = (e.clientX - rect.left) / rect.width;
          setHover(Math.round(frac * (labels.length - 1)));
        }}
      >
        {gridLines.map((g, i) => (
          <line key={i} x1="0" y1={g.y} x2="100" y2={g.y} stroke="var(--v2-border)" strokeWidth="0.25" vectorEffect="non-scaling-stroke" />
        ))}
        {paths.map((p, i) => (
          <g key={i}>
            <path d={p.area} fill={p.color} opacity={stacked ? 0.55 : 0.12} />
            <path d={p.line} fill="none" stroke={p.color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
          </g>
        ))}
        {hover !== null && labels[hover] !== undefined ? (
          <line
            x1={(hover / Math.max(1, labels.length - 1)) * 100}
            y1="0"
            x2={(hover / Math.max(1, labels.length - 1)) * 100}
            y2="100"
            stroke="var(--v2-text-muted)"
            strokeWidth="0.5"
            vectorEffect="non-scaling-stroke"
            strokeDasharray="2,2"
          />
        ) : null}
      </svg>
      {hover !== null && labels[hover] !== undefined ? (
        <div
          style={{
            position: "absolute",
            top: 8,
            left: `${(hover / Math.max(1, labels.length - 1)) * 100}%`,
            transform: "translateX(-50%)",
            background: "var(--v2-bg-raised)",
            border: "1px solid var(--v2-border-strong)",
            borderRadius: 8,
            padding: "6px 10px",
            fontSize: 11.5,
            boxShadow: "var(--v2-shadow-md)",
            pointerEvents: "none",
            whiteSpace: "nowrap",
            zIndex: 5,
          }}
        >
          <div style={{ fontWeight: 620, marginBottom: 2 }}>{labels[hover]}</div>
          {series.map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--v2-text-secondary)" }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, display: "inline-block" }} />
              {s.name}: <strong style={{ color: "var(--v2-text)" }}>{formatValue(s.points[hover]?.value ?? 0)}</strong>
            </div>
          ))}
          {stacked ? (
            <div style={{ marginTop: 2, borderTop: "1px solid var(--v2-border)", paddingTop: 2, fontWeight: 620 }}>
              Total: {formatValue(totals[hover] ?? 0)}
            </div>
          ) : null}
        </div>
      ) : null}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
        <span style={{ fontSize: 10.5, color: "var(--v2-text-muted)" }}>{labels[0]}</span>
        <span style={{ fontSize: 10.5, color: "var(--v2-text-muted)" }}>{labels[labels.length - 1]}</span>
      </div>
      <div style={{ display: "flex", gap: 14, marginTop: 8, flexWrap: "wrap" }}>
        {series.map((s, i) => (
          <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--v2-text-secondary)" }}>
            <span style={{ width: 10, height: 3, borderRadius: 2, background: s.color, display: "inline-block" }} />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── DonutChart ───────────────────────────────────────────── */

export function DonutChart({
  segments,
  size = 140,
  thickness = 16,
  centerLabel,
  centerValue,
}: {
  segments: Array<{ label: string; value: number; color: string }>;
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string | number;
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const radius = 50 - thickness / 2;
  const circumference = 2 * Math.PI * radius;

  let offset = 0;
  const arcs = segments
    .filter((s) => s.value > 0)
    .map((s) => {
      const frac = total > 0 ? s.value / total : 0;
      const dash = frac * circumference;
      const arc = { ...s, dash, offset };
      offset += dash;
      return arc;
    });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
      <svg width={size} height={size} viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="var(--v2-bg-sunken)" strokeWidth={thickness} />
        {arcs.map((arc, i) => (
          <circle
            key={i}
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke={arc.color}
            strokeWidth={thickness}
            strokeDasharray={`${Math.max(0, arc.dash - 1.5)} ${circumference}`}
            strokeDashoffset={-arc.offset}
            transform="rotate(-90 50 50)"
            strokeLinecap="butt"
          />
        ))}
        {centerValue !== undefined ? (
          <>
            <text x="50" y="47" textAnchor="middle" style={{ fontSize: 19, fontWeight: 700, fill: "var(--v2-text)", fontFamily: "var(--v2-font-mono)" }}>
              {centerValue}
            </text>
            {centerLabel ? (
              <text x="50" y="60" textAnchor="middle" style={{ fontSize: 8.5, fill: "var(--v2-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {centerLabel}
              </text>
            ) : null}
          </>
        ) : null}
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {segments.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color, display: "inline-block" }} />
            <span style={{ color: "var(--v2-text-secondary)" }}>{s.label}</span>
            <strong style={{ marginLeft: "auto", fontFamily: "var(--v2-font-mono)" }}>{s.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── BarChart (horizontal) ────────────────────────────────── */

export function HBarChart({
  bars,
  formatValue = (v: number) => String(v),
}: {
  bars: Array<{ label: string; value: number; color?: string }>;
  formatValue?: (v: number) => string;
}) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {bars.map((bar, i) => (
        <div key={i}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
            <span style={{ color: "var(--v2-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>{bar.label}</span>
            <strong style={{ fontFamily: "var(--v2-font-mono)" }}>{formatValue(bar.value)}</strong>
          </div>
          <div style={{ height: 6, background: "var(--v2-bg-sunken)", borderRadius: 3, overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width: `${(bar.value / max) * 100}%`,
                background: bar.color ?? "var(--v2-accent)",
                borderRadius: 3,
                transition: "width 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Sparkline ────────────────────────────────────────────── */

export function Sparkline({
  points,
  color = "var(--v2-accent)",
  width = 96,
  height = 28,
}: {
  points: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  const max = Math.max(1, ...points);
  const path = points
    .map((p, i) => {
      const x = (i / Math.max(1, points.length - 1)) * 100;
      const y = 100 - (p / max) * 100;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg width={width} height={height} viewBox="0 0 100 100" preserveAspectRatio="none">
      <path d={path} fill="none" stroke={color} strokeWidth="4" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/* ── Metric with trend ────────────────────────────────────── */

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${minutes}m ${secs}s`;
}
