import { useState, useEffect } from 'react';
import { useGhostnet } from '../context/GhostnetContext';

const HISTORY_LEN = 10;

// Keeps the last N healthScore readings per (sectorId, agentId) pair, so any
// signal in the 468-signal mesh can get a sparkline, not just 3 fixed agents.
// Consumers key into the returned object with `${sectorId}:${agentId}`.
export function useSparklineData() {
  const { allSignals } = useGhostnet();
  const [history, setHistory] = useState({});

  useEffect(() => {
    setHistory((prev) => {
      const updated = { ...prev };
      (allSignals || []).forEach((sig) => {
        if (!sig) return;
        const key = `${sig.sectorId}:${sig.agentId}`;
        const current = prev[key] ?? [];
        const next = [...current, sig.healthScore].slice(-HISTORY_LEN);
        // Skip the update if nothing actually changed, to avoid a render
        // loop when allSignals re-renders with identical values.
        if (current[current.length - 1] !== sig.healthScore) {
          updated[key] = next;
        } else if (!updated[key]) {
          updated[key] = next;
        }
      });
      return updated;
    });
  }, [allSignals]);

  return history;
}