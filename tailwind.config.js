/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Design system tokens - use CSS variables for light/dark support
        wev: {
          bg: 'var(--bg)',
          surface: 'var(--surface)',
          'surface-tint': 'var(--surface-tint)',
          border: 'var(--border)',
          'border-dark': 'var(--border-dark)',
          'text-primary': 'var(--text-primary)',
          'text-secondary': 'var(--text-secondary)',
          'text-tertiary': 'var(--text-tertiary)',
          primary: 'var(--primary)',
          'primary-tint': 'var(--primary-tint)',
          'primary-text': 'var(--primary-text)',
          accent: 'var(--accent)',
          'accent-tint': 'var(--accent-tint)',
          success: 'var(--success-solid)',
          'success-tint': 'var(--success-tint)',
          'success-text': 'var(--success-text)',
          alert: 'var(--alert-solid)',
          'alert-tint': 'var(--alert-tint)',
          'alert-text': 'var(--alert-text)',
          warn: 'var(--warn-solid)',
          'warn-tint': 'var(--warn-tint)',
          'warn-text': 'var(--warn-text)',
          info: 'var(--info-solid)',
          'info-tint': 'var(--info-tint)',
          'info-text': 'var(--info-text)',
        },
      },
      fontFamily: {
        sans: ['var(--font-lexend)', 'Lexend Deca', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      borderRadius: {
        'wev-card': '16px',
        'wev-pill': '50px',
        'wev-btn': '8px',
      },
      boxShadow: {
        'wev-card': '0 4px 10px rgba(0,0,0,0.045)',
        'wev-card-hover': '0 6px 15px rgba(0,0,0,0.06)',
        'wev-btn': '0 4px 6px rgba(0,0,0,0.06)',
      },
    },
  },
  plugins: [],
}
