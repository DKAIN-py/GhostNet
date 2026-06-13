// GHOSTNET — Engineering Journal Theme (Variant 03)
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
    severity: {
      good:     { text: '#5C574C',  border: '#4A463D'            },
      moderate: { text: '#2B2822',  border: '#1A1815'            },
      critical: { text: '#FCFAF5',  bg: '#2B2822', border: '#2B2822' },
    },
    cascade: {
      bg:     '#2B2822',
      text:   '#FCFAF5',
      border: '#2B2822',
    },
    font: {
      mono: "'JetBrains Mono', 'Fira Code', monospace",
      sans: "'SF Pro Display', 'Inter', sans-serif",
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
// export const THEMES = {
//   monochrome: {
//     bg: {
//       root:    '#EAEAEA',
//       card:    '#FFFFFF',
//       surface: '#F3F3F3',
//       hover:   '#E0E0E0',
//     },
//     border: {
//       default: '#111111',
//       strong:  '#000000',
//       subtle:  '#CCCCCC',
//     },
//     text: {
//       primary:   '#111111',
//       secondary: '#444444',
//       muted:     '#777777',
//       micro:     '#999999',
//     },
//     severity: {
//       good:     { text: '#444444', border: '#111111' },
//       moderate: { text: '#111111', border: '#000000' },
//       critical: { text: '#FFFFFF', bg: '#000000', border: '#000000' }, // Inverts to absolute solid dark ink blocks
//     },
//     cascade: {
//       bg:     '#000000',
//       text:   '#FFFFFF',
//       border: '#000000',
//     },
//     font: {
//       mono: "'JetBrains Mono', 'Fira Code', monospace",
//       sans: "'SF Pro Display', 'Inter', sans-serif",
//     },
//   },
// };

// export const T = THEMES.monochrome;

// export function getSeverityStyle(severity) {
//   switch (severity?.toLowerCase()) {
//     case 'critical': return T.severity.critical;
//     case 'moderate': return T.severity.moderate;
//     default:         return T.severity.good;
//   }
// }