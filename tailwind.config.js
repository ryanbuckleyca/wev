/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class', '[data-theme="dark"]'],
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // shadcn/ui standard tokens — used by all pasted shadcn components
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        card: {
          DEFAULT: 'var(--card)',
          foreground: 'var(--foreground)',
        },
        popover: {
          DEFAULT: 'var(--card)',
          foreground: 'var(--foreground)',
        },
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
        },
        secondary: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--foreground)',
        },
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-foreground)',
        },
        accent: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--foreground)',
        },
        destructive: {
          DEFAULT: 'var(--destructive)',
          foreground: 'var(--destructive-foreground)',
        },
        border: 'var(--border)',
        input: 'var(--border)',
        ring: 'var(--primary)',
        // Extended wev tokens — custom semantic colours with no shadcn equivalent
        // Kept under wev.* namespace for use in existing components
        wev: {
          'text-tertiary': 'var(--text-tertiary)',
          'primary-tint': 'var(--primary-tint)',
          'primary-text': 'var(--primary-text)',
          'brand-accent': 'var(--brand-accent)',
          'brand-accent-tint': 'var(--brand-accent-tint)',
          success: 'var(--success-solid)',
          'success-tint': 'var(--success-tint)',
          'success-text': 'var(--success-text)',
          'destructive-tint': 'var(--destructive-tint)',
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
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        'wev-card': '12px',
        'wev-pill': '50px',
        'wev-btn': '12px',
      },
      boxShadow: {
        'wev-dropdown': '0 4px 12px rgba(0,0,0,0.1197), 0 2px 4px rgba(0,0,0,0.0812)',
      },
    },
  },
  plugins: [require("tailwind-scrollbar-hide")],
}
