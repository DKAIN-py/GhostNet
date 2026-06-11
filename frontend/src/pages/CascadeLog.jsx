import { useGhostnet } from '../context/GhostnetContext';
import { T } from '../lib/theme';

export default function CascadeLog() {
  const { cascadeHistory, fireFakeCascade } = useGhostnet();

  return (
    <div className="flex flex-col gap-4 p-5 h-full overflow-y-auto"
      style={{ fontFamily: T.font.mono, background: T.bg.root }}>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xs tracking-[0.3em] uppercase font-bold" style={{ color: T.text.primary }}>
            CASCADE LOG
          </h1>
          <p className="text-[10px] tracking-widest mt-0.5" style={{ color: T.text.micro }}>
            {cascadeHistory.length} events this session
          </p>
        </div>
        <button
          onClick={fireFakeCascade}
          className="text-[10px] tracking-widest uppercase px-3 py-1.5 transition-all"
          style={{ border: `1px solid ${T.border.default}`, color: T.text.secondary, background: T.bg.surface, fontFamily: T.font.mono }}
          onMouseEnter={(e) => e.currentTarget.style.background = T.bg.hover}
          onMouseLeave={(e) => e.currentTarget.style.background = T.bg.surface}
        >
          ⚡ FIRE TEST CASCADE
        </button>
      </div>

      {/* Divider */}
      <div style={{ height: '1px', background: T.border.subtle }} />

      {/* Empty state */}
      {cascadeHistory.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2">
          <span className="text-[10px] tracking-widest uppercase" style={{ color: T.text.micro }}>
            NO CASCADES RECORDED
          </span>
          <span className="text-[9px]" style={{ color: T.text.micro }}>
            Fire a test cascade to see it logged here
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {cascadeHistory.map((c, i) => (
            <CascadeEntry key={c.timestamp ?? i} cascade={c} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

function CascadeEntry({ cascade, index }) {
  return (
    <div
      className="flex flex-col gap-3 p-4"
      style={{
        background: index === 0 ? T.cascade.bg : T.bg.card,
        border:     index === 0 ? `2px solid ${T.cascade.border}` : `1px solid ${T.border.subtle}`,
        color:      index === 0 ? T.cascade.text : T.text.primary,
      }}
    >
      {/* Top row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-[10px] tracking-widest uppercase font-bold"
            style={{ color: index === 0 ? T.cascade.text : T.text.primary }}>
            ▲ CASCADE #{String(index + 1).padStart(3, '0')}
          </span>
          {index === 0 && (
            <span className="text-[9px] px-2 py-0.5 tracking-widest uppercase"
              style={{ border: `1px solid ${T.cascade.text}`, color: T.cascade.text }}>
              LATEST
            </span>
          )}
        </div>
        <span className="text-[9px]" style={{ color: index === 0 ? 'rgba(252,250,245,0.40)' : T.text.micro }}>
          {new Date(cascade.timestamp).toLocaleString('en-IN', { hour12: false })}
        </span>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'CONFIDENCE',   value: `${cascade.confidence}%`    },
          { label: 'PREDICTED',    value: cascade.predictedEvent       },
          { label: 'HOURS UNTIL',  value: `~${cascade.hoursUntil}h`   },
          { label: 'AGENTS',       value: cascade.agentsTriggered?.join(', ') },
        ].map((s) => (
          <div key={s.label} className="flex flex-col gap-1">
            <span className="text-[8px] tracking-widest uppercase"
              style={{ color: index === 0 ? 'rgba(252,250,245,0.35)' : T.text.micro }}>
              {s.label}
            </span>
            <span className="text-[11px] font-bold leading-tight"
              style={{ color: index === 0 ? T.cascade.text : T.text.primary }}>
              {s.value}
            </span>
          </div>
        ))}
      </div>

      {/* Recommendation */}
      <p className="text-[10px]"
        style={{ color: index === 0 ? 'rgba(252,250,245,0.65)' : T.text.secondary }}>
        → {cascade.recommendation}
      </p>
    </div>
  );
}