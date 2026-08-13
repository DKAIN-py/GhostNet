import { useGhostnet } from '../../context/GhostnetContext';
import { useReplayMode } from '../../context/ReplayContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { T } from '../../lib/theme';
import { ALL_AGENT_IDS } from '../../lib/schema';

export default function Topbar() {
  const { connected, cascade } = useGhostnet();
  const { enterReplay, exitReplay } = useReplayMode();
  const navigate = useNavigate();
  const location = useLocation();
  const isReplay = location.pathname === '/replay';

  return (
    <header
      className="h-11 flex items-center justify-between px-3 sm:px-6 shrink-0 gap-2"
      style={{ background: T.bg.card, borderBottom: `1px solid ${T.border.default}`, fontFamily: T.font.mono }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2 sm:gap-4 min-w-0">
        <span className="text-sm font-bold tracking-[0.3em] uppercase shrink-0" style={{ color: T.text.primary }}>
          GHOST<span style={{ color: T.text.muted }}>NET</span>
        </span>
        <span className="hidden md:inline text-[10px] tracking-widest uppercase truncate" style={{ color: T.text.micro }}>
          Urban Early Warning Engine
        </span>
      </div>

      {/* Cascade alarm — only on live mode, hidden on very small screens to keep the toggle usable */}
      {cascade && !isReplay && (
        <div
          className="hidden sm:flex items-center gap-3 px-4 py-1 text-xs font-bold tracking-widest uppercase truncate max-w-[40%]"
          style={{ background: T.cascade.bg, color: T.cascade.text }}
        >
          ▲ CASCADE — {cascade.triggeredAgents?.length ?? 0}/{ALL_AGENT_IDS.length} AGENTS
        </div>
      )}

      {/* Right */}
      <div className="flex items-center gap-2 sm:gap-4 shrink-0">
        {/* LIVE / REPLAY toggle */}
        <div className="flex items-center" style={{ border: `1px solid ${T.border.default}` }}>
          <button
            onClick={() => { exitReplay(); navigate('/'); }}
            className="text-[9px] tracking-widest uppercase px-2 sm:px-3 py-1.5 transition-all font-bold"
            style={{
              background: !isReplay ? T.text.primary : 'transparent',
              color: !isReplay ? T.bg.card : T.text.muted,
              fontFamily: T.font.mono,
              borderRight: `1px solid ${T.border.default}`,
            }}
          >
            LIVE
          </button>
          <button
            onClick={() => { enterReplay(); navigate('/replay'); }}
            className="text-[9px] tracking-widest uppercase px-2 sm:px-3 py-1.5 transition-all font-bold"
            style={{
              background: isReplay ? T.text.primary : 'transparent',
              color: isReplay ? T.bg.card : T.text.muted,
              fontFamily: T.font.mono,
            }}
          >
            REPLAY
          </button>
        </div>

        {/* Connection dot */}
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-[6px] h-[6px] rounded-full"
            style={{ background: connected ? T.text.primary : T.border.subtle, animation: connected ? 'pulse-dot 2s infinite' : 'none' }}
          />
          <span
            className="hidden sm:inline text-[10px] tracking-widest uppercase"
            style={{ color: connected ? T.text.secondary : T.text.micro }}
          >
            {connected ? 'LIVE' : 'MOCK'}
          </span>
        </div>

        <span className="hidden lg:inline text-[10px] tracking-widest" style={{ color: T.text.micro }}>
          DELHI NODE
        </span>
      </div>

      <style>{`@keyframes pulse-dot { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </header>
  );
}