import { useEffect, useRef } from "react";
import { LineChart, Line, ResponsiveContainer, Tooltip } from "recharts";
import { T, getSeverityStyle } from "../../lib/theme";
import { useGhostnet } from "../../context/GhostnetContext";
import { AGENT_META } from "../../lib/schema";

export default function AgentCard({ signal, sparkline = [] }) {
  if (!signal) return null;

  const { cascade } = useGhostnet();

  const meta = AGENT_META[signal.agentId] || {};
  const sev = getSeverityStyle(signal.anomalyLevel === "warning" ? "moderate" : signal.anomalyLevel);
  const isCritical = signal.anomalyLevel === "critical";
  const isModerate = signal.anomalyLevel === "warning" || signal.anomalyLevel === "moderate";

  // A signal only counts as "triggered" if it's both an agent the cascade
  // engine flagged AND in the sector the cascade actually touched — with
  // 39 sectors sharing the same 12 agentIds, agent match alone isn't enough.
  const triggeredByCascade =
    !!cascade &&
    cascade.triggeredAgents?.includes(signal.agentId) &&
    (cascade.primarySectorId === signal.sectorId || cascade.spatialSpread?.includes(signal.sectorId));

  const prevScore = useRef(signal.healthScore);
  const scoreChanged = prevScore.current !== signal.healthScore;
  useEffect(() => {
    prevScore.current = signal.healthScore;
  });

  const chartData = sparkline.map((v, i) => ({ i, v }));

  const cardBg = triggeredByCascade ? T.cascade.bg : isCritical ? T.severity.critical.bg : T.bg.card;
  const cardText = triggeredByCascade ? T.cascade.text : isCritical ? T.severity.critical.text : T.text.primary;
  const cardBorder = triggeredByCascade
    ? `2px solid ${T.cascade.border}`
    : isCritical
    ? `2px solid ${T.border.strong}`
    : isModerate
    ? `1px solid ${T.border.default}`
    : `1px solid ${T.border.subtle}`;
  const subColor = triggeredByCascade ? "rgba(252,250,245,0.45)" : isCritical ? "rgba(252,250,245,0.5)" : T.text.secondary;
  const microColor = triggeredByCascade ? "rgba(252,250,245,0.30)" : isCritical ? "rgba(252,250,245,0.35)" : T.text.micro;

  return (
    <div
      className="flex flex-col gap-3 p-4 transition-all duration-500 min-w-0"
      style={{
        background: cardBg,
        color: cardText,
        border: cardBorder,
        fontFamily: T.font.mono,
        animation: triggeredByCascade
          ? "pulse-border-cascade 1s ease infinite"
          : isCritical
          ? "pulse-border 1.5s ease infinite"
          : "none",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] tracking-[0.2em] uppercase font-bold truncate" style={{ color: microColor }}>
            {meta.label || signal.agentId}
          </span>
          {signal.isLiveAnchor && (
            <span
              className="text-[8px] tracking-widest uppercase font-bold px-1.5 py-0.5 shrink-0"
              style={{ border: `1px solid ${microColor}`, color: microColor }}
              title="Live data anchor — real API feed, not simulated"
            >
              LIVE
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {triggeredByCascade && (
            <span
              className="text-[9px] px-2 py-0.5 tracking-widest uppercase font-bold"
              style={{ border: `1px solid ${T.cascade.text}`, color: T.cascade.text }}
            >
              TRIGGERED
            </span>
          )}
          <span
            className="text-[9px] px-2 py-0.5 tracking-widest uppercase font-bold"
            style={{
              border: `1px solid ${triggeredByCascade ? T.cascade.text : sev.border}`,
              color: triggeredByCascade ? T.cascade.text : sev.text ?? cardText,
            }}
          >
            {signal.anomalyLevel?.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Sector context — a signal alone doesn't say where anymore */}
      <span className="text-[8px] tracking-wider truncate" style={{ color: microColor }}>
        {signal.sectorId} · {signal.district}
      </span>

      {/* Health Score */}
      <div className="flex items-baseline gap-2">
        <span
          className="text-4xl sm:text-5xl font-bold tracking-tight leading-none transition-all duration-300"
          style={{ color: cardText, animation: scoreChanged ? "score-flash 0.4s ease" : "none" }}
        >
          {signal.healthScore}
        </span>
        <span className="text-sm tracking-widest" style={{ color: subColor }}>
          /100
        </span>
        <span className="text-[9px] tracking-widest ml-1 hidden sm:inline" style={{ color: microColor }}>
          HEALTH
        </span>
      </div>

      {/* Progress bar */}
      <div
        className="w-full h-[2px] relative overflow-hidden"
        style={{ background: triggeredByCascade ? "rgba(252,250,245,0.15)" : T.border.subtle }}
      >
        <div
          className="h-full transition-all duration-700"
          style={{ width: `${100 - signal.healthScore}%`, background: cardText }}
        />
      </div>

      {/* Sparkline */}
      {chartData.length > 1 && (
        <div style={{ height: 40, marginLeft: -8, marginRight: -8 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <Line type="monotone" dataKey="v" stroke={cardText} strokeWidth={1} dot={false} isAnimationActive animationDuration={400} />
              <Tooltip
                contentStyle={{
                  background: cardBg,
                  border: `1px solid ${triggeredByCascade ? T.cascade.text : T.border.default}`,
                  color: cardText,
                  fontSize: "10px",
                  fontFamily: T.font.mono,
                  padding: "4px 8px",
                }}
                formatter={(v) => [`${v}/100`, "health"]}
                labelFormatter={() => ""}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Signal text */}
      <p className="text-[10px] leading-relaxed line-clamp-3" style={{ color: subColor }}>
        {signal.signal}
      </p>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] tracking-widest uppercase truncate" style={{ color: microColor }}>
          /{meta.dataAnchor?.split(" ")[0] || meta.domain || "source"}
        </span>
        <span className="text-[9px] shrink-0" style={{ color: microColor }}>
          {new Date(signal.timestamp).toLocaleTimeString("en-IN", {
            hour12: false,
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })}
        </span>
      </div>

      <style>{`
        @keyframes pulse-border {
          0%,100% { border-color: ${T.border.strong}; }
          50%     { border-color: ${T.border.subtle}; }
        }
        @keyframes pulse-border-cascade {
          0%,100% { border-color: ${T.cascade.border}; opacity: 1;    }
          50%     { border-color: ${T.cascade.border}; opacity: 0.85; }
        }
        @keyframes score-flash {
          0%   { opacity: 0.3; transform: translateY(-3px); }
          100% { opacity: 1;   transform: translateY(0);    }
        }
      `}</style>
    </div>
  );
}