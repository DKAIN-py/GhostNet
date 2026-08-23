import { T } from './theme';

// Maps the citywide incident's 4-level severity enum (NOMINAL / ELEVATED /
// HIGH / CRITICAL) onto the theme's 3-level severity palette, with HIGH
// getting its own accent so it reads as distinct from full CRITICAL.
export function cityStatusStyle(severity) {
  switch (severity) {
    case 'CRITICAL':
      return T.severity.critical;
    case 'HIGH':
      return { text: T.accent.rust, bg: T.bg.card, border: T.accent.rust };
    case 'ELEVATED':
      return T.severity.moderate;
    case 'NOMINAL':
    default:
      return T.severity.good;
  }
}

export function timeAgo(isoString) {
  if (!isoString) return '—';
  const diffMs = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}