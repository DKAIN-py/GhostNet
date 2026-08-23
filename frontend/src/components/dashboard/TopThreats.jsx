import { useNavigate } from 'react-router-dom';
import { T } from '../../lib/theme';

export default function TopThreats({ threats }) {
  const navigate = useNavigate();

  return (
    <div style={{ border: `1px solid ${T.border.default}`, background: T.bg.card, fontFamily: T.font.mono }}>
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${T.border.subtle}` }}>
        <span className="text-[11px] tracking-[0.2em] uppercase font-bold" style={{ color: T.text.primary }}>TOP THREATS</span>
        <span className="text-[10px]" style={{ color: T.text.micro }}>{threats.length}</span>
      </div>

      {threats.length === 0 ? (
        <div className="px-4 py-6 text-center">
          <span className="text-[10px] tracking-widest uppercase" style={{ color: T.text.micro }}>Mesh nominal — no active threats</span>
        </div>
      ) : (
        threats.map((t) => (
          <button
            key={t.id}
            onClick={() => t.sectorId && navigate(`/sectors/${t.sectorId}`)}
            className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left transition-all"
            style={{ borderBottom: `1px solid ${T.border.subtle}`, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: T.font.mono }}
            onMouseEnter={(e) => (e.currentTarget.style.background = T.bg.hover)}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <div className="min-w-0">
              <span className="text-[12px] tracking-wide uppercase font-bold block truncate" style={{ color: T.severity.critical.bg }}>
                ▲ {t.label}
              </span>
              <span className="text-[10px] truncate block mt-0.5" style={{ color: T.text.micro }}>
                {t.from}{t.to ? ` → ${t.to}` : ''}
              </span>
            </div>
            <span className="text-2xl font-bold shrink-0" style={{ color: T.text.primary }}>{t.score}</span>
          </button>
        ))
      )}
    </div>
  );
}