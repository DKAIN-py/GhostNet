import { useState, useEffect } from 'react';
import { useGhostnet } from '../context/GhostnetContext';

// Keeps last 10 healthScore readings per agent for sparkline
export function useSparklineData() {
  const { signals } = useGhostnet();
  const [history, setHistory] = useState({
    air_quality: [55, 50, 48, 42, 38, 35, 34, 34, 34, 34],
    transport:   [80, 75, 70, 65, 62, 58, 55, 55, 55, 55],
    sentiment:   [60, 52, 45, 38, 33, 30, 28, 28, 28, 28],
  });

  useEffect(() => {
    setHistory((prev) => {
      const updated = { ...prev };
      Object.values(signals).forEach((sig) => {
        if (!sig) return;
        const current = prev[sig.agentId] ?? [];
        updated[sig.agentId] = [...current, sig.healthScore].slice(-10);
      });
      return updated;
    });
  }, [signals]);

  return history;
}