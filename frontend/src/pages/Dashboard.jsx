import { useGhostnet } from '../context/GhostnetContext';
import { useMockStream } from '../hooks/useMockStream';
import { useSparklineData } from '../hooks/useSparklineData';
import { T } from '../lib/theme';
import AgentCard from '../components/dashboard/AgentCard';
import CascadeBar from '../components/dashboard/CascadeBar';
import SignalFeed from '../components/dashboard/SignalFeed';
import SchemaPanel from '../components/dashboard/SchemaPanel';

export default function Dashboard() {
  const { signals } = useGhostnet();
  useMockStream(3000);
  const sparklines = useSparklineData();

  return (
    <div className="flex flex-col gap-4 p-5 h-full overflow-y-auto"
      style={{ fontFamily: T.font.mono, background: T.bg.root }}>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xs tracking-[0.3em] uppercase font-bold" style={{ color: T.text.primary }}>
            LIVE DASHBOARD
          </h1>
          <p className="text-[10px] tracking-widest mt-0.5" style={{ color: T.text.micro }}>
            3 agents · Delhi · updating every 60s
          </p>
        </div>

        {/* Stream activity bar */}
        <div className="flex items-center gap-2">
          <span className="text-[9px] tracking-widest uppercase" style={{ color: T.text.micro }}>
            AGENT STREAM
          </span>
          <div className="w-24 h-[1px] relative overflow-hidden" style={{ background: T.border.subtle }}>
            <div className="absolute top-0 left-0 h-full w-8"
              style={{ background: T.text.muted, animation: 'stream-bar 1.6s linear infinite' }} />
          </div>
        </div>
      </div>

      <CascadeBar />

      <div className="grid grid-cols-3 gap-4">
        <AgentCard signal={signals.air_quality} sparkline={sparklines.air_quality} />
        <AgentCard signal={signals.transport}   sparkline={sparklines.transport}   />
        <AgentCard signal={signals.sentiment}   sparkline={sparklines.sentiment}   />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div style={{ border: `1px solid ${T.border.default}` }}><SignalFeed /></div>
        <div style={{ border: `1px solid ${T.border.default}` }}><SchemaPanel /></div>
      </div>

      <style>{`
        @keyframes stream-bar {
          from { transform: translateX(-100%); }
          to   { transform: translateX(400%); }
        }
      `}</style>
    </div>
  );
}