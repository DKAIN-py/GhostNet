import { T } from '../../lib/theme';

const ITEMS = [
  { label: 'Nominal', dot: T.severity.good.border },
  { label: 'Warning', dot: T.severity.moderate.border },
  { label: 'Critical', dot: T.severity.critical.border },
];

// One line, reused wherever severity-colored cards/pills appear (Sector
// Browser, Sector Detail) so the color meaning is never left to guesswork.
export default function SeverityLegend() {
  return (
    <div className="flex items-center gap-4 flex-wrap" style={{ fontFamily: T.font.mono }}>
      {ITEMS.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5 text-[10px] tracking-widest uppercase" style={{ color: T.text.micro }}>
          <span className="w-[7px] h-[7px] rounded-full shrink-0" style={{ background: item.dot }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}