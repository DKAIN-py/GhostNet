// Day 3 work — Cascade Log
// Placeholder: populated on Day 3 when cascade detector is wired

import { useGhostnet } from '../context/GhostnetContext';

export default function CascadeLog() {
  const { cascadeHistory } = useGhostnet();

  return (
    <div
      className="flex flex-col gap-4 p-5 h-full"
      style={{ fontFamily: "'JetBrains Mono', monospace" }}
    >
      <h1 className="text-xs tracking-[0.3em] uppercase font-bold text-white">
        CASCADE LOG
      </h1>

      {cascadeHistory.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-[10px] tracking-widest text-white/15 uppercase">
            No cascades recorded this session
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {cascadeHistory.map((c, i) => (
            <div
              key={c.id ?? i}
              className="flex items-center gap-4 px-4 py-3"
              style={{ border: '1px solid rgba(255,255,255,0.15)' }}
            >
              <span className="text-white text-[10px] font-bold tracking-widest">
                ▲ CASCADE
              </span>
              <span className="text-white/40 text-[10px]">
                {new Date(c.timestamp * 1000).toLocaleString()}
              </span>
              <span className="text-white/30 text-[9px]">
                {c.agents_triggered?.join(' · ')}
              </span>
              <span className="text-white/20 text-[9px] ml-auto">
                {c.message}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}