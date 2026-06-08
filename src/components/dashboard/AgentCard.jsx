import { useEffect, useRef } from 'react';
import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts';
import { T, getSeverityStyle } from '../../lib/theme';

const AGENT_META = {
  air_quality: { label: 'AIR QUALITY', source: 'OpenAQ'    },
  transport:   { label: 'TRANSPORT',   source: 'TomTom'    },
  sentiment:   { label: 'SENTIMENT',   source: 'Twitter/X' },
};

export default function AgentCard({ signal, sparkline = [] }) {
  if (!signal) return null;

  const meta       = AGENT_META[signal.agentId];
  const sev        = getSeverityStyle(signal.anomalyLevel);
  const isCritical = signal.anomalyLevel === 'critical';
  const isModerate = signal.anomalyLevel === 'moderate';
  const prevScore  = useRef(signal.healthScore);
  const scoreChanged = prevScore.current !== signal.healthScore;
  useEffect(() => { prevScore.current = signal.healthScore; });

  const chartData  = sparkline.map((v, i) => ({ i, v }));

  const cardBg     = isCritical ? T.severity.critical.bg  : T.bg.card;
  const cardText   = isCritical ? T.severity.critical.text : T.text.primary;
  const cardBorder = isCritical
    ? `2px solid ${T.border.strong}`
    : isModerate
    ? `1px solid ${T.border.default}`
    : `1px solid ${T.border.subtle}`;

  return (
    <div
      className="flex flex-col gap-3 p-4 transition-all duration-500"
      style={{
        background: cardBg,
        color:      cardText,
        border:     cardBorder,
        fontFamily: T.font.mono,
        animation:  isCritical ? 'pulse-border 1.5s ease infinite' : 'none',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] tracking-[0.25em] uppercase font-bold"
          style={{ color: isCritical ? T.severity.critical.text : T.text.muted }}>
          {meta.label}
        </span>
        <span className="text-[9px] px-2 py-0.5 tracking-widest uppercase font-bold"
          style={{
            border:     `1px solid ${sev.border}`,
            color:      sev.text ?? cardText,
            background: isCritical ? 'transparent' : T.bg.surface,
          }}>
          {signal.anomalyLevel.toUpperCase()}
        </span>
      </div>

      {/* Health Score */}
      <div className="flex items-baseline gap-2">
        <span
          className="text-5xl font-bold tracking-tight leading-none transition-all duration-300"
          style={{
            color:     cardText,
            animation: scoreChanged ? 'score-flash 0.4s ease' : 'none',
          }}
        >
          {signal.healthScore}
        </span>
        <span className="text-sm tracking-widest" style={{ color: isCritical ? 'rgba(252,250,245,0.5)' : T.text.muted }}>
          /100
        </span>
        <span className="text-[9px] tracking-widest ml-1" style={{ color: isCritical ? 'rgba(252,250,245,0.4)' : T.text.micro }}>
          HEALTH
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-[2px] relative overflow-hidden"
        style={{ background: isCritical ? 'rgba(252,250,245,0.15)' : T.border.subtle }}>
        <div className="h-full transition-all duration-700"
          style={{ width: `${100 - signal.healthScore}%`, background: cardText }} />
      </div>

      {/* Sparkline */}
      {chartData.length > 1 && (
        <div style={{ height: 40, marginLeft: -8, marginRight: -8 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <Line
                type="monotone"
                dataKey="v"
                stroke={cardText}
                strokeWidth={1}
                dot={false}
                isAnimationActive={true}
                animationDuration={400}
              />
              <Tooltip
                contentStyle={{
                  background: cardBg,
                  border:     `1px solid ${T.border.default}`,
                  color:      cardText,
                  fontSize:   '10px',
                  fontFamily: T.font.mono,
                  padding:    '4px 8px',
                }}
                formatter={(v) => [`${v}/100`, 'health']}
                labelFormatter={() => ''}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Signal text */}
      <p className="text-[10px] leading-relaxed"
        style={{ color: isCritical ? 'rgba(252,250,245,0.7)' : T.text.secondary }}>
        {signal.signal}
      </p>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <span className="text-[9px] tracking-widest uppercase"
          style={{ color: isCritical ? 'rgba(252,250,245,0.35)' : T.text.micro }}>
          /{meta.source}
        </span>
        <span className="text-[9px]"
          style={{ color: isCritical ? 'rgba(252,250,245,0.35)' : T.text.micro }}>
          {new Date(signal.timestamp).toLocaleTimeString('en-IN', {
            hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit',
          })}
        </span>
      </div>

      <style>{`
        @keyframes pulse-border {
          0%,100% { border-color: ${T.border.strong}; }
          50%     { border-color: ${T.border.subtle}; }
        }
        @keyframes score-flash {
          0%   { opacity: 0.3; transform: translateY(-3px); }
          100% { opacity: 1;   transform: translateY(0);    }
        }
      `}</style>
    </div>
  );
}