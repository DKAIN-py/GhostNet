import { useEffect } from 'react';
import { useGhostnet } from '../context/GhostnetContext';
import { SECTORS } from '../lib/sectors';
import { ALL_AGENT_IDS, AGENT_META } from '../lib/schema';

// Keeps the mesh feeling "alive" when there's no real backend connected —
// picks a random (sector, agent) pair every tick, nudges its health score,
// and lets the spatial cascade engine recompute off the new state. Only
// runs while `connected` is false; once a real socket is live this is a
// no-op so it never fights the real backend's data.
export function useMockStream(intervalMs = 4000) {
  const { pushMockSignal, recomputeCascade, connected } = useGhostnet();

  useEffect(() => {
    if (connected) return;

    const timer = setInterval(() => {
      const sector = SECTORS[Math.floor(Math.random() * SECTORS.length)];
      const agentId = ALL_AGENT_IDS[Math.floor(Math.random() * ALL_AGENT_IDS.length)];
      const meta = AGENT_META[agentId];

      // Light random walk around a plausible band — not trying to reproduce
      // the full per-agent profile generator in schema.js, just enough
      // motion that the feed/sparklines/network stats visibly tick.
      const healthScore = Math.max(5, Math.min(97, Math.round(60 + (Math.random() - 0.5) * 70)));
      const anomalyLevel = healthScore < 35 ? 'critical' : healthScore < 60 ? 'warning' : 'nominal';

      pushMockSignal({
        agentId,
        domain: meta?.domain,
        sectorId: sector.sectorId,
        district: sector.district,
        isLiveAnchor: sector.isLiveAnchor,
        healthScore,
        anomalyLevel,
        signal: `${meta?.label ?? agentId} reading updated in ${sector.name}.`,
        location: {
          placeName: sector.name,
          lat: sector.lat,
          lng: sector.lng,
          radiusMeters: 300,
        },
        metrics: {},
        timestamp: new Date().toISOString(),
      });

      recomputeCascade();
    }, intervalMs);

    return () => clearInterval(timer);
  }, [connected, intervalMs, pushMockSignal, recomputeCascade]);
}