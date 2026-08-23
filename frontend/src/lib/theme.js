// GHOSTNET — Engineering Journal Theme
// Single source of truth for light + dark themes.

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
    accent: {
      amber:  '#B8862E',
      rust:   '#A6522E',
      teal:   '#2E6B66',
      indigo: '#3E4E8A',
    },
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
    chart: [
      '#B8862E',
      '#4E8B5C',
      '#8C2C22',
      '#3E4E8A',
      '#2E6B66',
      '#A6522E',
    ],
    font: {
      mono: "'Quantico', sans-serif",
      sans: "'Instrument Serif', serif",
    },
  },

  dark: {
    bg: {
      root:    '#070A0C',
      card:    '#101519',
      surface: '#182126',
      hover:   '#243039',
    },
  
    border: {
      default: '#53616A',
      strong:  '#E7EDF0',
      subtle:  'rgba(190,210,220,0.25)',
    },
  
    text: {
      primary:   '#F4F7F8',
      secondary: '#CBD5DA',
      muted:     '#8E9CA4',
      micro:     '#687780',
    },
  
    accent: {
      amber:  '#FFB52E',
      rust:   '#FF6247',
      teal:   '#27D3C2',
      indigo: '#8295FF',
    },
  
    domain: {
      environment:    '#45E879',
      transit:        '#FFB52E',
      infrastructure: '#FF8A4C',
      civic:          '#A98BFF',
    },
  
    severity: {
      good: {
        text:   '#63F28A',
        bg:     '#0D2918',
        border: '#29C95D',
      },
  
      moderate: {
        text:   '#FFD166',
        bg:     '#30230A',
        border: '#FFB52E',
      },
  
      critical: {
        text:   '#FFFFFF',
        bg:     '#4A0D0A',
        border: '#FF3B30',
      },
    },
  
    cascade: {
      bg:     '#4D0907',
      text:   '#FFFFFF',
      border: '#FF3B30',
    },
  
    chart: [
      '#27D3C2',
      '#45E879',
      '#FF3B30',
      '#8295FF',
      '#FFB52E',
      '#FF8A4C',
    ],
  
    font: {
      mono: "'Quantico', sans-serif",
      sans: "'Instrument Serif', serif",
    },
  },
};

// ------------------------------------------------------------
// Theme state
// ------------------------------------------------------------

const STORAGE_KEY = 'ghostnet-theme';

export function getInitialTheme() {
  if (typeof window === 'undefined') return 'monochrome';

  const saved = localStorage.getItem(STORAGE_KEY);

  if (saved === 'dark' || saved === 'monochrome') {
    return saved;
  }

  return 'monochrome';
}

export function applyTheme(themeName) {
  if (typeof document === 'undefined') return;

  const theme = THEMES[themeName] || THEMES.monochrome;
  const root = document.documentElement;

  // Background
  root.style.setProperty('--gn-bg-root', theme.bg.root);
  root.style.setProperty('--gn-bg-card', theme.bg.card);
  root.style.setProperty('--gn-bg-surface', theme.bg.surface);
  root.style.setProperty('--gn-bg-hover', theme.bg.hover);

  // Borders
  root.style.setProperty('--gn-border-default', theme.border.default);
  root.style.setProperty('--gn-border-strong', theme.border.strong);
  root.style.setProperty('--gn-border-subtle', theme.border.subtle);

  // Text
  root.style.setProperty('--gn-text-primary', theme.text.primary);
  root.style.setProperty('--gn-text-secondary', theme.text.secondary);
  root.style.setProperty('--gn-text-muted', theme.text.muted);
  root.style.setProperty('--gn-text-micro', theme.text.micro);

  // Accents
  root.style.setProperty('--gn-accent-amber', theme.accent.amber);
  root.style.setProperty('--gn-accent-rust', theme.accent.rust);
  root.style.setProperty('--gn-accent-teal', theme.accent.teal);
  root.style.setProperty('--gn-accent-indigo', theme.accent.indigo);

  // Domains
  root.style.setProperty('--gn-domain-environment', theme.domain.environment);
  root.style.setProperty('--gn-domain-transit', theme.domain.transit);
  root.style.setProperty('--gn-domain-infrastructure', theme.domain.infrastructure);
  root.style.setProperty('--gn-domain-civic', theme.domain.civic);

  // Severity
  root.style.setProperty('--gn-severity-good-text', theme.severity.good.text);
  root.style.setProperty('--gn-severity-good-bg', theme.severity.good.bg);
  root.style.setProperty('--gn-severity-good-border', theme.severity.good.border);

  root.style.setProperty('--gn-severity-moderate-text', theme.severity.moderate.text);
  root.style.setProperty('--gn-severity-moderate-bg', theme.severity.moderate.bg);
  root.style.setProperty('--gn-severity-moderate-border', theme.severity.moderate.border);

  root.style.setProperty('--gn-severity-critical-text', theme.severity.critical.text);
  root.style.setProperty('--gn-severity-critical-bg', theme.severity.critical.bg);
  root.style.setProperty('--gn-severity-critical-border', theme.severity.critical.border);

  // Cascade
  root.style.setProperty('--gn-cascade-bg', theme.cascade.bg);
  root.style.setProperty('--gn-cascade-text', theme.cascade.text);
  root.style.setProperty('--gn-cascade-border', theme.cascade.border);

  root.dataset.theme = themeName;
  localStorage.setItem(STORAGE_KEY, themeName);
}

// ------------------------------------------------------------
// Reactive T object
// ------------------------------------------------------------

export const T = {
  bg: {
    root:    'var(--gn-bg-root)',
    card:    'var(--gn-bg-card)',
    surface: 'var(--gn-bg-surface)',
    hover:   'var(--gn-bg-hover)',
  },

  border: {
    default: 'var(--gn-border-default)',
    strong:  'var(--gn-border-strong)',
    subtle:  'var(--gn-border-subtle)',
  },

  text: {
    primary:   'var(--gn-text-primary)',
    secondary: 'var(--gn-text-secondary)',
    muted:     'var(--gn-text-muted)',
    micro:     'var(--gn-text-micro)',
  },

  accent: {
    amber:  'var(--gn-accent-amber)',
    rust:   'var(--gn-accent-rust)',
    teal:   'var(--gn-accent-teal)',
    indigo: 'var(--gn-accent-indigo)',
  },

  domain: {
    environment:    'var(--gn-domain-environment)',
    transit:        'var(--gn-domain-transit)',
    infrastructure: 'var(--gn-domain-infrastructure)',
    civic:          'var(--gn-domain-civic)',
  },

  severity: {
    good: {
      text:   'var(--gn-severity-good-text)',
      bg:     'var(--gn-severity-good-bg)',
      border: 'var(--gn-severity-good-border)',
    },

    moderate: {
      text:   'var(--gn-severity-moderate-text)',
      bg:     'var(--gn-severity-moderate-bg)',
      border: 'var(--gn-severity-moderate-border)',
    },

    critical: {
      text:   'var(--gn-severity-critical-text)',
      bg:     'var(--gn-severity-critical-bg)',
      border: 'var(--gn-severity-critical-border)',
    },
  },

  cascade: {
    bg:     'var(--gn-cascade-bg)',
    text:   'var(--gn-cascade-text)',
    border: 'var(--gn-cascade-border)',
  },

  // Keep chart colors as actual values.
  // Chart libraries generally don't accept CSS variables.
  chart: THEMES.monochrome.chart,

  font: {
    mono: "'Quantico', sans-serif",
    sans: "'Instrument Serif', serif",
  },
};

export function getSeverityStyle(severity) {
  switch (severity?.toLowerCase()) {
    case 'critical':
      return T.severity.critical;

    case 'moderate':
      return T.severity.moderate;

    default:
      return T.severity.good;
  }
}

export function getDomainColor(domain) {
  return T.domain[domain] || T.text.secondary;
}