import { useEffect } from 'react';
import { useGhostnet } from '../../context/GhostnetContext';
import { T } from '../../lib/theme';

export default function CascadeModal() {
  const { cascade, clearCascade } = useGhostnet();

  // Close on Escape key
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') clearCascade(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [clearCascade]);

  if (!cascade) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(43,40,34,0.75)' }}
        onClick={clearCascade}
      />

      {/* Modal */}
      <div
        className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg"
        style={{
          background: T.cascade.bg,
          border:     `2px solid ${T.cascade.border}`,
          fontFamily: T.font.mono,
          animation:  'modal-in 0.15s ease-out',
          willChange: 'opacity, scale',
        }}
      >
        {/* Modal header */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: `1px solid rgba(252,250,245,0.15)` }}
        >
          <div className="flex items-center gap-3">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ background: T.cascade.text, animation: 'blink 1s step-start infinite' }}
            />
            <span className="text-xs tracking-[0.3em] uppercase font-bold" style={{ color: T.cascade.text }}>
              CASCADE DETECTED
            </span>
          </div>
          <span className="text-[10px] tracking-widest" style={{ color: 'rgba(252,250,245,0.40)' }}>
            {new Date(cascade.timestamp).toLocaleTimeString('en-IN', { hour12: false })}
          </span>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-px p-px" style={{ background: 'rgba(252,250,245,0.10)' }}>
          <StatBlock label="CONFIDENCE"       value={`${cascade.confidence}%`}   />
          <StatBlock label="HOURS UNTIL PEAK" value={`~${cascade.hoursUntil}h`}  />
          <StatBlock label="PREDICTED EVENT"  value={cascade.predictedEvent}     large />
          <StatBlock label="AGENTS TRIGGERED" value={cascade.agentsTriggered?.join(' + ')?.toUpperCase()} />
        </div>

        {/* Recommendation */}
        <div
          className="px-6 py-4"
          style={{ borderTop: `1px solid rgba(252,250,245,0.10)`, borderBottom: `1px solid rgba(252,250,245,0.10)` }}
        >
          <p className="text-[9px] tracking-[0.2em] uppercase mb-2" style={{ color: 'rgba(252,250,245,0.40)' }}>
            RECOMMENDATION
          </p>
          <p className="text-sm font-bold leading-relaxed" style={{ color: T.cascade.text }}>
            {cascade.recommendation}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between px-6 py-4">
          <span className="text-[9px] tracking-widest uppercase" style={{ color: 'rgba(252,250,245,0.30)' }}>
            ESC to dismiss
          </span>
          <button
            onClick={clearCascade}
            className="text-[11px] tracking-widest uppercase px-5 py-2 font-bold transition-all"
            style={{
              border:     `1px solid ${T.cascade.text}`,
              color:      T.cascade.bg,
              background: T.cascade.text,
              fontFamily: T.font.mono,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = T.cascade.text;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = T.cascade.text;
              e.currentTarget.style.color = T.cascade.bg;
            }}
          >
            ACKNOWLEDGE &amp; CLEAR
          </button>
        </div>
      </div>

      <style>{`
        @keyframes modal-in {
          from { opacity: 0; scale: 0.96; }
          to   { opacity: 1; scale: 1;    }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0; }
        }
      `}</style>
    </>
  );
}

function StatBlock({ label, value, large = false }) {
  return (
    <div
      className="flex flex-col gap-1 px-6 py-4"
      style={{ background: T.cascade.bg }}
    >
      <span className="text-[9px] tracking-[0.2em] uppercase" style={{ color: 'rgba(252,250,245,0.40)' }}>
        {label}
      </span>
      <span
        className={`font-bold leading-tight ${large ? 'text-lg' : 'text-2xl'}`}
        style={{ color: T.cascade.text }}
      >
        {value}
      </span>
    </div>
  );
}