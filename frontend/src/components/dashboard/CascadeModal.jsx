import { useEffect, useRef, useState } from 'react';
import { useGhostnet } from '../../context/GhostnetContext';
import { T } from '../../lib/theme';

function severityFromScore(confidence) {
  if (confidence >= 85) return { label: 'CRITICAL' };
  if (confidence >= 65) return { label: 'ELEVATED' };
  return { label: 'ADVISORY' };
}

export default function CascadeModal() {
  const { cascade, clearCascade } = useGhostnet();

  const [visible, setVisible] = useState(false);
  // Snapshot of the cascade being displayed — deliberately decoupled from
  // the live `cascade` value in context. The offline jitter loop recomputes
  // the cascade every ~2.5s, and any random tick that drops a score back
  // under threshold makes `cascade` briefly go null — if the modal reacted
  // to that directly it would appear to "close itself." Instead we only
  // ever update/clear this snapshot from user action or a genuinely new
  // cascade, never from the live value flickering.
  const [displayedCascade, setDisplayedCascade] = useState(null);
  const prevKeyRef = useRef(null);

  useEffect(() => {
    if (!cascade) return; // ignore nulls entirely — never auto-closes from this

    if (cascade.primarySectorId !== prevKeyRef.current) {
      setDisplayedCascade(cascade);
      setVisible(true);
      prevKeyRef.current = cascade.primarySectorId;
    }
  }, [cascade]);

  if (!visible || !displayedCascade) return null;

  const severity = severityFromScore(displayedCascade.confidence ?? 0);

  function handleAcknowledgeClear() {
    setVisible(false);
    prevKeyRef.current = null;
    setDisplayedCascade(null);
    clearCascade();
  }

  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: 'rgba(43,40,34,0.55)' }} />

      {/* Flex-centered wrapper instead of top/left + translate — avoids any
          positioning race against the entrance animation's own transform. */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="w-full sm:max-w-xl max-h-[85vh] overflow-y-auto"
          style={{
            background: T.bg.card,
            border: `1px solid ${T.border.default}`,
            borderLeft: `4px solid ${T.border.strong}`,
            fontFamily: T.font.mono,
            animation: 'modal-in 0.18s ease-out',
          }}
        >
          {/* Header */}
          <div
            className="flex items-start justify-between gap-3 px-5 py-4"
            style={{ borderBottom: `1px solid ${T.border.subtle}`, background: T.bg.surface }}
          >
            <div className="flex items-start gap-3 min-w-0">
              <span
                className="inline-flex items-center justify-center w-8 h-8 shrink-0 text-sm font-bold"
                style={{ border: `1.5px solid ${T.border.strong}`, color: T.text.primary }}
              >
                ▲
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] tracking-[0.2em] uppercase font-bold" style={{ color: T.text.primary }}>
                    Cascade Detected
                  </span>
                  <span
                    className="text-[8px] tracking-widest uppercase font-bold px-1.5 py-0.5"
                    style={{ border: `1px solid ${T.border.strong}`, color: T.text.primary }}
                  >
                    {severity.label}
                  </span>
                </div>
                {displayedCascade.primarySectorName && (
                  <span className="text-[10px] tracking-wide block mt-0.5" style={{ color: T.text.muted }}>
                    {displayedCascade.primarySectorName}{displayedCascade.district ? ` · ${displayedCascade.district}` : ''}{displayedCascade.primarySectorId ? ` · ${displayedCascade.primarySectorId}` : ''}
                  </span>
                )}
              </div>
            </div>

            <span className="text-[9px] tracking-widest shrink-0" style={{ color: T.text.micro }}>
              {new Date(displayedCascade.timestamp).toLocaleTimeString('en-IN', { hour12: false })}
            </span>
          </div>

          {/* Plain-language summary */}
          <div className="px-5 py-4" style={{ borderBottom: `1px solid ${T.border.subtle}` }}>
            <p className="text-[13px] leading-relaxed font-bold" style={{ color: T.text.primary }}>
              {displayedCascade.predictedEvent}
            </p>
            <p className="text-[11px] leading-relaxed mt-1.5" style={{ color: T.text.secondary }}>
              The system is {displayedCascade.confidence}% confident this will reach peak impact in about{' '}
              <strong>{displayedCascade.hoursUntil}{displayedCascade.hoursUntil === 1 ? ' hour' : ' hours'}</strong>, spreading from{' '}
              <strong>{displayedCascade.primarySectorName || displayedCascade.primarySectorId}</strong>
              {displayedCascade.spatialSpread?.length > 0 && (
                <> into {displayedCascade.spatialSpread.length} nearby sector{displayedCascade.spatialSpread.length > 1 ? 's' : ''}</>
              )}.
            </p>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-px" style={{ background: T.border.subtle }}>
            <StatBlock label="CONFIDENCE" value={`${displayedCascade.confidence}%`} />
            <StatBlock label="TIME TO PEAK" value={`~${displayedCascade.hoursUntil}h`} />
          </div>

          {/* Triggered agents */}
          {displayedCascade.triggeredAgents?.length > 0 && (
            <div className="px-5 py-4" style={{ borderTop: `1px solid ${T.border.subtle}` }}>
              <p className="text-[9px] tracking-[0.2em] uppercase mb-2" style={{ color: T.text.micro }}>
                Contributing Signals
              </p>
              <div className="flex flex-wrap gap-1.5">
                {displayedCascade.triggeredAgents.map((a) => (
                  <span
                    key={a}
                    className="text-[9px] tracking-wider uppercase px-2 py-1"
                    style={{ border: `1px solid ${T.border.default}`, color: T.text.secondary, background: T.bg.surface }}
                  >
                    {a.replaceAll('_', ' ')}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Spatial spread */}
          {displayedCascade.spatialSpread?.length > 0 && (
            <div className="px-5 py-4" style={{ borderTop: `1px solid ${T.border.subtle}` }}>
              <p className="text-[9px] tracking-[0.2em] uppercase mb-2" style={{ color: T.text.micro }}>
                Sectors In Path
              </p>
              <p className="text-[11px] leading-relaxed" style={{ color: T.text.secondary }}>
                {displayedCascade.spatialSpread.join(' → ')}
              </p>
            </div>
          )}

          {/* Recommendations */}
          <div className="px-5 py-4" style={{ borderTop: `1px solid ${T.border.subtle}`, background: T.bg.surface }}>
            <p className="text-[9px] tracking-[0.2em] uppercase mb-2" style={{ color: T.text.micro }}>
              Recommended Actions
            </p>
            <ul className="flex flex-col gap-2 m-0 p-0" style={{ listStyle: 'none' }}>
              {(displayedCascade.recommendations ?? []).map((rec, i) => (
                <li key={i} className="text-[12px] leading-relaxed flex gap-2" style={{ color: T.text.primary }}>
                  <span style={{ color: T.text.muted }}>{i + 1}.</span>
                  {rec}
                </li>
              ))}
            </ul>
          </div>

          {/* Action — the ONLY way to dismiss */}
          <div className="flex items-center justify-between px-5 py-4 gap-3" style={{ borderTop: `1px solid ${T.border.subtle}` }}>
            <span className="text-[9px] tracking-widest uppercase" style={{ color: T.text.micro }}>
              {displayedCascade.alertId}
            </span>
            <button
              onClick={handleAcknowledgeClear}
              className="text-[11px] tracking-widest uppercase px-5 py-2.5 font-bold transition-all"
              style={{
                border: `1px solid ${T.border.strong}`,
                color: T.bg.card,
                background: T.border.strong,
                fontFamily: T.font.mono,
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = T.text.primary;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = T.border.strong;
                e.currentTarget.style.color = T.bg.card;
              }}
            >
              Acknowledge &amp; Clear
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes modal-in {
          from { opacity: 0; transform: scale(0.97); }
          to   { opacity: 1; transform: scale(1);     }
        }
      `}</style>
    </>
  );
}

function StatBlock({ label, value }) {
  return (
    <div className="flex flex-col gap-1 px-5 py-3" style={{ background: T.bg.card }}>
      <span className="text-[8px] tracking-[0.2em] uppercase" style={{ color: T.text.micro }}>{label}</span>
      <span className="text-xl font-bold" style={{ color: T.text.primary }}>{value}</span>
    </div>
  );
}