// GHOSTNET — Engineering Journal Theme (Variant 04)
// Single source of truth. Never hardcode colors elsewhere.

export const THEMES = {
  monochrome: {
    bg: {
      root:    '#F4F1EA',
      card:    '#FCFAF5',
      surface: '#EAE5D8',
      hover:   '#E3DCB9',
    },
    border: {
      default: '#4A463D',
      strong:  '#1A1815',
      subtle:  'rgba(74,70,61,0.15)',
    },
    text: {
      primary:   '#2B2822',
      secondary: '#5C574C',
      muted:     '#8C8575',
      micro:     '#A39C8D',
    },

    // Spot-color accents — sparing use for interactive states
    // (active nav, links, focus rings, small badges). Keeps the
    // paper-and-ink base from going fully grayscale everywhere.
    accent: {
      amber:  '#B8862E',
      rust:   '#A6522E',
      teal:   '#2E6B66',
      indigo: '#3E4E8A',
    },

    // Per-domain colors — matches AGENT_META's four domains
    // (environment / transit / infrastructure / civic), so agent
    // badges, legends, and filters share one palette instead of
    // each new component inventing its own hex values.
    domain: {
      environment:    '#4E7A4A',
      transit:        '#B8862E',
      infrastructure: '#7A5A3E',
      civic:          '#5E4A8A',
    },

    severity: {
      good:     { text: '#3F6B4A', bg: '#E7F0E2', border: '#4E8B5C' },
      moderate: { text: '#8A5A1E', bg: '#F5E7C9', border: '#C6862E' },
      critical: { text: '#FCEDE8', bg: '#8C2C22', border: '#6B1F18' },
    },

    cascade: {
      bg:     '#3A2420',
      text:   '#FCEDE8',
      border: '#6B1F18',
    },

    // Ordered chart palette — for sparklines / multi-series charts,
    // so line colors stay consistent with the rest of the theme
    // instead of a charting library's default rainbow.
    chart: ['#B8862E', '#4E8B5C', '#8C2C22', '#3E4E8A', '#2E6B66', '#A6522E'],

    font: {
      mono: "'Quantico', sans-serif",
      sans: "'Instrument Serif', serif",
    },
  },
};

export const T = THEMES.monochrome;

export function getSeverityStyle(severity) {
  switch (severity?.toLowerCase()) {
    case 'critical': return T.severity.critical;
    case 'moderate': return T.severity.moderate;
    default:         return T.severity.good;
  }
}

export function getDomainColor(domain) {
  return T.domain[domain] || T.text.secondary;
}