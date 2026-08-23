import { useEffect } from 'react';
import { useGhostnet } from '../context/GhostnetContext';

// Simulates AI agent posting signals every N seconds
// Disable this on Day 5 when real backend is live

const MOCK_VARIATIONS = [
  { agentId: 'air_quality', domain: 'air',      healthScore: 34, anomalyLevel: 'critical', signal: 'AQI at 168, PM2.5 rising fast'              },
  { agentId: 'air_quality', domain: 'air',      healthScore: 41, anomalyLevel: 'critical', signal: 'AQI at 155, sustained unhealthy levels'      },
  { agentId: 'air_quality', domain: 'air',      healthScore: 62, anomalyLevel: 'moderate', signal: 'AQI at 112, moderate — watch trend'          },
  { agentId: 'transport',   domain: 'transport', healthScore: 55, anomalyLevel: 'moderate', signal: 'NH-48 congestion at 45%, slowing'            },
  { agentId: 'transport',   domain: 'transport', healthScore: 30, anomalyLevel: 'critical', signal: 'Ring Road jammed — 70% congestion'           },
  { agentId: 'transport',   domain: 'transport', healthScore: 75, anomalyLevel: 'good',     signal: 'Traffic nominal across monitored corridors'  },
  { agentId: 'sentiment',   domain: 'social',    healthScore: 28, anomalyLevel: 'critical', signal: 'Negative tweet surge — smog trending'        },
  { agentId: 'sentiment',   domain: 'social',    healthScore: 50, anomalyLevel: 'moderate', signal: 'Complaint volume rising — air quality topic' },
  { agentId: 'sentiment',   domain: 'social',    healthScore: 80, anomalyLevel: 'good',     signal: 'Sentiment stable, no anomaly detected'       },
];

export function useMockStream(intervalMs = 3000) {
  const { pushMockSignal, connected } = useGhostnet();

  useEffect(() => {
    // Only run mock stream when NOT connected to real backend
    if (connected) return;

    const timer = setInterval(() => {
      const random = MOCK_VARIATIONS[Math.floor(Math.random() * MOCK_VARIATIONS.length)];
      pushMockSignal({
        ...random,
        timestamp: new Date().toISOString(),
      });
    }, intervalMs);

    return () => clearInterval(timer);
  }, [connected, intervalMs, pushMockSignal]);
}