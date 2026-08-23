import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGhostnet } from '../../context/GhostnetContext';
import { T } from '../../lib/theme';

const AUTO_DISMISS_MS = 9000;
const MAX_VISIBLE = 3;

export default function CascadeAlertTray() {
  const { cascades } = useGhostnet();
  const navigate = useNavigate();

  const [toasts, setToasts] = useState([]); // [{ id, sectorId, cascade }]
  const activeIdsRef = useRef(new Set());
  const dismissedRef = useRef(new Set());

  useEffect(() => {
    const list = cascades || [];
    const currentIds = new Set(list.map((c) => c.primarySectorId));

    // Once a sector's cascade clears, forget it was dismissed — the next
    // time it fires it's a genuinely new event and should alert again.
    dismissedRef.current.forEach((id) => {
      if (!currentIds.has(id)) dismissedRef.current.delete(id);
    });

    const fresh = list.filter(
      (c) => !activeIdsRef.current.has(c.primarySectorId) && !dismissedRef.current.has(c.primarySectorId)
    );

    if (fresh.length > 0) {
      setToasts((prev) =>
        [
          ...fresh.map((c) => ({ id: `${c.primarySectorId}-${Date.now()}`, sectorId: c.primarySectorId, cascade: c })),
          ...prev,
        ].slice(0, 8)
      );
    }

    activeIdsRef.current = currentIds;
  }, [cascades]);

  function dismiss(toastId, sectorId) {
    dismissedRef.current.add(sectorId);
    setToasts((prev) => prev.filter((t) => t.id !== toastId));
  }

  function openSector(sectorId, toastId) {
    navigate(`/sectors/${sectorId}`);
    setToasts((prev) => prev.filter((t) => t.id !== toastId));
  }

  if (toasts.length === 0) return null;

  const visible = toasts.slice(0, MAX_VISIBLE);
  const overflow = toasts.length - visible.length;

  return (
    <div
      className="fixed bottom-3 right-3 z-40 flex flex-col-reverse gap-2 w-[calc(100%-1.5rem)] sm:w-80"
      style={{ fontFamily: T.font.mono }}
    >
      {visible.map((t) => (
        <Toast key={t.id} toast={t} onDismiss={dismiss} onOpen={openSector} />
      ))}
      {overflow > 0 && (
        <div className="text-[10px] tracking-widest uppercase text-right px-2 py-1 font-bold" style={{ color: T.text.micro }}>
          +{overflow} more active — see Top Threats
        </div>
      )}
    </div>
  );
}

function Toast({ toast, onDismiss, onOpen }) {
  const { cascade, sectorId, id } = toast;

  useEffect(() => {
    const timer = setTimeout(() => onDismiss(id, sectorId), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return (
    <button
      onClick={() => onOpen(sectorId, id)}
      className="flex items-start gap-3 px-3.5 py-3 text-left transition-transform"
      style={{
        background: T.cascade.bg,
        border: `1px solid ${T.cascade.border}`,
        borderLeft: `3px solid ${T.cascade.text}`,
        fontFamily: T.font.mono,
        cursor: 'pointer',
        animation: 'toast-in 0.2s ease-out',
      }}
    >
      <span className="text-sm font-bold shrink-0" style={{ color: T.cascade.text }}>▲</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] tracking-wide uppercase font-bold truncate" style={{ color: T.cascade.text }}>
            {cascade.primarySectorName || sectorId}
          </span>
          <span
            className="text-[10px] font-bold shrink-0"
            onClick={(e) => { e.stopPropagation(); onDismiss(id, sectorId); }}
            style={{ color: 'rgba(252,250,245,0.5)', cursor: 'pointer' }}
          >
            ✕
          </span>
        </div>
        <p className="text-[10px] leading-snug mt-1 truncate" style={{ color: 'rgba(252,250,245,0.75)' }}>
          {cascade.predictedEvent} · {cascade.confidence}% confidence
        </p>
      </div>
      <style>{`@keyframes toast-in { from{opacity:0; transform: translateY(6px);} to{opacity:1; transform: translateY(0);} }`}</style>
    </button>
  );
}