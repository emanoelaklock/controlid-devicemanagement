/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{html,tsx,ts}'],
  darkMode: 'class',
  theme: {
    extend: {
      // Legacy palette — still used by the pages that keep the old visual
      // treatment (Dashboard, Discovery, Firmware, Configuration, Tasks,
      // Credentials, Audit log) until they are migrated.
      colors: {
        brand: {
          50: '#eef2ff', 100: '#e0e7ff', 200: '#c7d2fe', 300: '#a5b4fc',
          400: '#818cf8', 500: '#6366f1', 600: '#4f46e5', 700: '#4338ca',
          800: '#3730a3', 900: '#312e81',
        },
        // Service Report design tokens (see src/renderer/styles/tokens.css).
        // All var()-based so [data-theme="dark"] flips them automatically.
        surface: 'var(--surface)',
        card: 'var(--surface-card)',
        sunken: 'var(--surface-sunken)',
        ink: 'var(--text)',
        'ink-strong': 'var(--text-strong)',
        muted: 'var(--text-muted)',
        line: 'var(--border)',
        'line-strong': 'var(--border-strong)',
        'sr-blue': 'var(--sr-blue)',
        'sr-green': 'var(--sr-green)',
        'sr-yellow': 'var(--sr-yellow)',
        'sr-orange': 'var(--sr-orange)',
        'sr-red': 'var(--sr-red)',
        'sr-purple': 'var(--sr-purple)',
        'sr-pink': 'var(--sr-pink)',
        'exec-bg': 'var(--sr-exec-bg)', 'exec-fg': 'var(--sr-exec-fg)', 'exec-m': 'var(--sr-exec-m)',
        'info-bg': 'var(--sr-info-bg)', 'info-fg': 'var(--sr-info-fg)', 'info-m': 'var(--sr-info-m)',
        'warn-bg': 'var(--sr-warn-bg)', 'warn-fg': 'var(--sr-warn-fg)', 'warn-m': 'var(--sr-warn-m)',
        'pend-bg': 'var(--sr-pend-bg)', 'pend-fg': 'var(--sr-pend-fg)', 'pend-m': 'var(--sr-pend-m)',
        'aguard-bg': 'var(--sr-aguard-bg)', 'aguard-fg': 'var(--sr-aguard-fg)', 'aguard-m': 'var(--sr-aguard-m)',
        'jrny-bg': 'var(--sr-jrny-bg)', 'jrny-fg': 'var(--sr-jrny-fg)', 'jrny-m': 'var(--sr-jrny-m)',
      },
      borderRadius: {
        card: '16px',      // portal cards
        control: '11px',   // inputs / controls
      },
      boxShadow: {
        card: 'var(--sr-shadow-card)',
        pop: 'var(--sr-shadow-pop)',
        primary: 'var(--sr-shadow-primary)',
        'kpi-blue': 'var(--sr-shadow-kpi-blue)',
        'kpi-green': 'var(--sr-shadow-kpi-green)',
        'kpi-amber': 'var(--sr-shadow-kpi-amber)',
        'kpi-purple': 'var(--sr-shadow-kpi-purple)',
      },
      fontFamily: {
        sr: ['Manrope', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
