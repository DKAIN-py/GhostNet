import { T } from '../../lib/theme';

function worstSeverity(health) {
  if (!health) return 'good';
  if (health.criticalCount > 0) return 'critical';
  if (health.warningCount > 0) return 'moderate';
  return 'good';
}

export default function SectorCard({ sector, health, riskScore, nonNominal, expanded, onToggle }) {
  const severity = worstSeverity(health);
  const isCritical = severity === 'critical';
  const isModerate = severity === 'moderate';

  const cardBg = isCritical ? T.severity.critical.bg : T.bg.card;
  const cardText = isCritical ? T.severity.critical.text : T.text.primary;
  const subColor = isCritical ? 'rgba(252,250,245,0.55)' : T.text.micro;

  const cardBorder = expanded
    ? `2px solid ${T.border.strong}`
    : isCritical
    ? `2px solid ${T.border.strong}`
    : isModerate
    ? `1px solid ${T.border.default}`
    : `1px solid ${T.border.subtle}`;

  return (
    <button
      onClick={onToggle}
      className="flex flex-col gap-1.5 p-3 text-left transition-all min-w-0"
      style={{ background: cardBg, color: cardText, border: cardBorder, fontFamily: T.font.mono, cursor: 'pointer' }}
      onMouseEnter={(e) => { if (!isCritical) e.currentTarget.style.background = T.bg.hover; }}
      onMouseLeave={(e) => { if (!isCritical) e.currentTarget.style.background = cardBg; }}
    >
      <span className="text-[10px] tracking-widest uppercase font-bold leading-tight truncate">
        {sector.name}
      </span>
      <span className="text-[8px] tracking-wider uppercase truncate" style={{ color: subColor }}>
        {sector.district}
      </span>

      <span className="text-2xl font-bold mt-0.5">{riskScore}</span>

      <span
        className="text-[8px] tracking-widest uppercase font-bold px-1.5 py-0.5 self-start"
        style={{ border: `1px solid ${cardText}`, color: cardText }}
      >
        {severity === 'critical' ? 'CRITICAL' : severity === 'moderate' ? 'WARNING' : 'NOMINAL'}
      </span>

      <span className="text-[8px] tracking-wider" style={{ color: subColor }}>
        {nonNominal}/12 flagged
      </span>

      {expanded && (
        <span className="text-[8px] tracking-widest uppercase mt-1 pt-1" style={{ color: subColor, borderTop: `1px solid ${isCritical ? 'rgba(252,250,245,0.2)' : T.border.subtle}` }}>
          ▼ expanded below
        </span>
      )}
    </button>
  );
}