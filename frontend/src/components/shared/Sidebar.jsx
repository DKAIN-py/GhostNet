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
    </aside>
  );
}