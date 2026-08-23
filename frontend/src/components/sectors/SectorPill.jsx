import { useNavigate } from 'react-router-dom';
import { T, getSeverityStyle } from '../../lib/theme';

// Discrete tiers instead of a continuous transform:scale — scale() grows a
// box visually without the flex layout reserving extra space for it, which
// is exactly what was causing pills to overlap their neighbors. Padding and
// font-size actually participate in layout, so bigger-risk pills push their
// neighbors instead of covering them.
function sizeTier(riskScore) {
  if (riskScore >= 65) return { padY: 'py-2.5', padX: 'px-3.5', font: 'text-[13px]', weight: 700 };
  if (riskScore >= 35) return { padY: 'py-2', padX: 'px-3', font: 'text-[12px]', weight: 600 };
  return { padY: 'py-1.5', padX: 'px-2.5', font: 'text-[11px]', weight: 500 };
}

export default function SectorPill({ sector, health, riskScore }) {
  const navigate = useNavigate();
  const severity = !health ? 'good' : health.criticalCount > 0 ? 'critical' : health.warningCount > 0 ? 'moderate' : 'good';
  const sev = getSeverityStyle(severity);
  const tier = sizeTier(riskScore);

  const isCritical = severity === 'critical';
  const isModerate = severity === 'moderate';

  return (
    <button
      onClick={() => navigate(`/sectors/${sector.sectorId}`)}
      className={`flex items-center gap-1.5 ${tier.padX} ${tier.padY} transition-colors`}
      style={{
        border: `1px solid ${isCritical ? sev.border : isModerate ? sev.border : T.border.subtle}`,
        background: isCritical ? sev.bg : isModerate ? sev.bg : T.bg.card,
        color: isCritical || isModerate ? sev.text : T.text.primary,
        fontFamily: T.font.mono,
        fontWeight: tier.weight,
        cursor: 'pointer',
      }}
      title={`${sector.name} · risk ${riskScore}`}
    >
      <span className="w-[6px] h-[6px] rounded-full shrink-0" style={{ background: sev.border }} />
      <span className={`${tier.font} tracking-wide truncate max-w-[150px]`}>{sector.name}</span>
      <span className={`${tier.font} opacity-70`}>{riskScore}</span>
    </button>
  );
}