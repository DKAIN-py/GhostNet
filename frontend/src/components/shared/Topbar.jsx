import { useGhostnet } from '../../context/GhostnetContext';
import { useReplayMode } from '../../context/ReplayContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { T } from '../../lib/theme';

export default function Topbar() {
  const { connected, cascade } = useGhostnet();
  const { mode, enterReplay, exitReplay } = useReplayMode();
  const navigate  = useNavigate();
  const location  = useLocation();
  const isReplay  = location.pathname === '/replay';

  function handleModeToggle() {
    if (isReplay) {
      exitReplay();
      navigate('/');
    } else {
      enterReplay();
      navigate('/replay');
    }
  }

  return (
    <header className="h-11 flex items-center justify-between px-6 shrink-0"
      style={{ background: T.bg.card, borderBottom: `1px solid ${T.border.default}`, fontFamily: T.font.mono }}>

      {/* Logo */}
      <div className="flex items-center gap-4">
        <span className="text-sm font-bold tracking-[0.3em] uppercase" style={{ color: T.text.primary }}>
          GHOST<span style={{ color: T.text.muted }}>NET</span>
        </span>
        <span className="text-[10px] tracking-widest uppercase" style={{ color: T.text.micro }}>
          Urban Early Warning Engine
        </span>
      </div>

      {/* Cascade alarm — only on live mode */}
      {cascade && !isReplay && (
        <div className="flex items-center gap-3 px-4 py-1 text-xs font-bold tracking-widest uppercase"
          style={{ background: T.cascade.bg, color: T.cascade.text }}>
          ▲ CASCADE — {cascade.agentsTriggered?.length ?? 3}/3 AGENTS CRITICAL
        </div>
      )}

      {/* Right */}
      <div className="flex items-center gap-4">
        {/* LIVE / REPLAY toggle */}
        <div className="flex items-center"
          style={{ border: `1px solid ${T.border.default}` }}>
          <button
            onClick={() => { exitReplay(); navigate('/'); }}
            className="text-[9px] tracking-widest uppercase px-3 py-1.5 transition-all font-bold"
            style={{
              background: !isReplay ? T.text.primary : 'transparent',
              color:      !isReplay ? T.bg.card       : T.text.muted,
              fontFamily: T.font.mono,
              borderRight: `1px solid ${T.border.default}`,
            }}
          >
            LIVE
          </button>
          <button
            onClick={() => { enterReplay(); navigate('/replay'); }}
            className="text-[9px] tracking-widest uppercase px-3 py-1.5 transition-all font-bold"
            style={{
              background: isReplay ? T.text.primary : 'transparent',
              color:      isReplay ? T.bg.card       : T.text.muted,
              fontFamily: T.font.mono,
            }}
          >
            REPLAY
          </button>
        </div>

        {/* Connection dot */}
        <div className="flex items-center gap-2">
          <span className="inline-block w-[6px] h-[6px] rounded-full"
            style={{ background: connected ? T.text.primary : T.border.subtle, animation: connected ? 'pulse-dot 2s infinite' : 'none' }} />
          <span className="text-[10px] tracking-widest uppercase"
            style={{ color: connected ? T.text.secondary : T.text.micro }}>
            {connected ? 'LIVE' : 'MOCK'}
          </span>
        </div>

        <span className="text-[10px] tracking-widest" style={{ color: T.text.micro }}>
          DELHI NODE
        </span>
      </div>

      <style>{`@keyframes pulse-dot { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </header>
  );
}