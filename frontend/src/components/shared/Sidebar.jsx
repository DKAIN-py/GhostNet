import { NavLink } from 'react-router-dom';
import { T } from '../../lib/theme';

const NAV = [
  { to: '/',         label: 'DASHBOARD',    icon: '⬛' },
  { to: '/nervous',  label: 'NERVOUS SYS',  icon: '◎' },
  { to: '/replay',   label: 'REPLAY',       icon: '▶'  },
  { to: '/cascade',  label: 'CASCADE LOG',  icon: '▲'  },
];

const AGENTS = [
  { label: 'AIR QUALITY', sub: 'openaq'  },
  { label: 'TRANSPORT',   sub: 'tomtom'  },
  { label: 'SENTIMENT',   sub: 'twitter' },
];

export default function Sidebar() {
  return (
    <aside className="w-48 shrink-0 flex flex-col py-4"
      style={{ borderRight: `1px solid ${T.border.default}`, fontFamily: T.font.mono, background: T.bg.card }}>

      <div className="px-4 mb-6">
        <p className="text-[9px] tracking-[0.2em] mb-3 uppercase" style={{ color: T.text.micro }}>SYSTEM</p>
        <nav className="flex flex-col gap-0.5">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '8px 12px', fontSize: '11px', letterSpacing: '0.1em',
                textTransform: 'uppercase', textDecoration: 'none',
                background:  isActive ? T.bg.surface : 'transparent',
                color:       isActive ? T.text.primary : T.text.muted,
                fontWeight:  isActive ? '700' : '400',
                borderLeft:  isActive ? `2px solid ${T.border.strong}` : '2px solid transparent',
                transition:  'all 0.15s',
              })}>
              <span>{n.icon}</span>{n.label}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="px-4">
        <p className="text-[9px] tracking-[0.2em] mb-3 uppercase" style={{ color: T.text.micro }}>AGENTS</p>
        <div className="flex flex-col gap-1">
          {AGENTS.map((a) => (
            <div key={a.label} className="flex flex-col px-3 py-2"
              style={{ border: `1px solid ${T.border.subtle}` }}>
              <span className="text-[10px] tracking-widest uppercase" style={{ color: T.text.secondary }}>{a.label}</span>
              <span className="text-[9px] tracking-wider mt-0.5" style={{ color: T.text.micro }}>/{a.sub}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-auto px-4 pt-4" style={{ borderTop: `1px solid ${T.border.subtle}` }}>
        <p className="text-[9px] tracking-widest uppercase" style={{ color: T.text.micro }}>DAY 4 · REPLAY LIVE</p>
        <p className="text-[9px] mt-0.5" style={{ color: T.text.micro }}>v0.4.0-alpha</p>
      </div>
    </aside>
  );
}