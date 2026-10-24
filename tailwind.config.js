/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/client/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Vazirmatn',
          'Tahoma',
          'Iranian Sans',
          'Noto Sans Arabic',
          'Segoe UI',
          'sans-serif',
        ],
      },
      colors: {
        brand: {
          navy: 'var(--color-brand-navy)',
          'navy-dark': 'var(--color-brand-navy-dark)',
          blue: 'var(--color-brand-blue)',
          turquoise: 'var(--color-brand-turquoise)',
          'turquoise-soft': 'var(--color-brand-turquoise-soft)',
          bg: 'var(--color-bg-app)',
          surface: 'var(--color-bg-surface)',
          subtle: 'var(--color-bg-subtle)',
          text: 'var(--color-text-main)',
          muted: 'var(--color-text-muted)',
          border: 'var(--color-border-main)',
        },
        status: {
          info: 'var(--color-status-info)',
          'info-bg': 'var(--color-status-info-bg)',
          warning: 'var(--color-status-warning)',
          'warning-bg': 'var(--color-status-warning-bg)',
          success: 'var(--color-status-success)',
          'success-bg': 'var(--color-status-success-bg)',
          danger: 'var(--color-status-danger)',
          'danger-bg': 'var(--color-status-danger-bg)',
          neutral: 'var(--color-status-neutral)',
          'neutral-bg': 'var(--color-status-neutral-bg)',
        },
      },
      borderRadius: {
        card: 'var(--radius-card)',
        control: 'var(--radius-control)',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        elevated: 'var(--shadow-elevated)',
      },
    },
  },
  plugins: [],
};
