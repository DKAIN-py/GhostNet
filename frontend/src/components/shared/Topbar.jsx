import { useGhostnet } from '../../context/GhostnetContext';
import { T } from '../../lib/theme';

export default function Topbar() {
  const { connected, cascade } = useGhostnet();

  return (
    <header
      className="h-11 flex items-center justify-between px-6 shrink-0"
      style={{
        background:   T.bg.card,
        borderBottom: `1px solid ${T.border.default}`,
        fontFamily:   T.font.mono,
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-4">
        <span className="text-sm font-bold tracking-[0.3em] uppercase" style={{ color: T.text.primary }}>
          GHOST<span style={{ color: T.text.muted }}>NET</span>
        </span>
        <span className="text-[10px] tracking-widest uppercase" style={{ color: T.text.micro }}>
          Urban Early Warning Engine
        </span>
      </div>

      {/* Cascade alarm strip */}
      {cascade && (
        <div
          className="flex items-center gap-3 px-4 py-1 text-xs font-bold tracking-widest uppercase"
          style={{ background: T.cascade.bg, color: T.cascade.text }}
        >
          ▲ CASCADE DETECTED — {cascade.agentsTriggered?.length ?? 3}/3 AGENTS CRITICAL
        </div>
      )}

      {/* Right — status */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-[6px] h-[6px] rounded-full"
            style={{
              background: connected ? T.text.primary : T.border.subtle,
              animation:  connected ? 'pulse-dot 2s infinite' : 'none',
            }}
          />
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