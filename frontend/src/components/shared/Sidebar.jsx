import { NavLink } from 'react-router-dom';
import { T } from '../../lib/theme';
import { useGhostnet } from '../../context/GhostnetContext';
import { AGENT_META, ALL_AGENT_IDS } from '../../lib/schema';

const NAV = [
  { to: '/',         label: 'DASHBOARD',    icon: '⬛' },
  { to: '/nervous',  label: 'NERVOUS SYS',  icon: '◎' },
  { to: '/citymap',  label: 'CITY MAP',     icon: '⬢' },
  { to: '/replay',   label: 'REPLAY',       icon: '▶'  },
  { to: '/cascade',  label: 'CASCADE LOG',  icon: '▲'  },
];

export default function Sidebar() {
  const { networkStats } = useGhostnet();

  return (
    <aside
      className="w-14 lg:w-52 shrink-0 flex flex-col py-4 transition-all"
      style={{ borderRight: `1px solid ${T.border.default}`, fontFamily: T.font.mono, background: T.bg.card }}
    >
      <div className="px-2 lg:px-4 mb-6">
        <p className="hidden lg:block text-[9px] tracking-[0.2em] mb-3 uppercase" style={{ color: T.text.micro }}>
          SYSTEM
        </p>
        <nav className="flex flex-col gap-0.5">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              title={n.label}
              className="flex items-center justify-center lg:justify-start gap-2.5 px-2 lg:px-3 py-2 text-[11px] tracking-[0.1em] uppercase no-underline transition-all"
              style={({ isActive }) => ({
                background: isActive ? T.bg.surface : 'transparent',
                color: isActive ? T.text.primary : T.text.muted,
                fontWeight: isActive ? '700' : '400',
                borderLeft: isActive ? `2px solid ${T.border.strong}` : '2px solid transparent',
              })}
            >
              <span>{n.icon}</span>
              <span className="hidden lg:inline">{n.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="hidden lg:block px-4">
        <p className="text-[9px] tracking-[0.2em] mb-3 uppercase" style={{ color: T.text.micro }}>
          AGENTS · {ALL_AGENT_IDS.length}
        </p>
        <div className="flex flex-col gap-1 max-h-72 overflow-y-auto pr-1">
          {ALL_AGENT_IDS.map((id) => {
            const meta = AGENT_META[id];
            return (
              <div key={id} className="flex flex-col px-3 py-1.5" style={{ border: `1px solid ${T.border.subtle}` }}>
                <span className="text-[9px] tracking-widest uppercase" style={{ color: T.text.secondary }}>
                  {meta?.label ?? id}
                </span>
                <span className="text-[8px] tracking-wider mt-0.5" style={{ color: T.text.micro }}>
                  /{meta?.domain}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-auto px-2 lg:px-4 pt-4" style={{ borderTop: `1px solid ${T.border.subtle}` }}>
        <div className="hidden lg:flex flex-col gap-0.5">
          <p className="text-[9px] tracking-widest uppercase" style={{ color: T.text.micro }}>
            39 SECTORS · {ALL_AGENT_IDS.length} AGENTS
          </p>
          <p
            className="text-[9px]"
            style={{ color: networkStats?.criticalCount > 0 ? T.severity.critical.bg : T.text.micro }}
          >
            {networkStats?.criticalCount ?? 0} critical · {networkStats?.warningCount ?? 0} warning
          </p>
        </div>
        <div className="lg:hidden flex flex-col items-center gap-1" title={`${networkStats?.criticalCount ?? 0} critical signals`}>
          <span
            className="text-[10px] font-bold"
            style={{ color: networkStats?.criticalCount > 0 ? T.severity.critical.bg : T.text.muted }}
          >
            {networkStats?.criticalCount ?? 0}
          </span>
        </div>
      </div>
    </aside>
  );
}