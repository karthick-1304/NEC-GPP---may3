/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Brand — matches backend email templates
        navy: {
          50:  '#eff3fb',
          100: '#dbe3f5',
          200: '#b6c5eb',
          300: '#8ba2dd',
          400: '#5d7cca',
          500: '#3a5cb6',
          600: '#2c479a',
          700: '#23397c',
          800: '#1e3a8a', // primary
          900: '#162a63',
          950: '#0d1a40',
        },
        amber: {
          400: '#fbbf24', // accent
          500: '#f59e0b',
        },
      },
      fontFamily: {
        sans: ['"Inter"', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', '"Inter"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'card':       '0 4px 14px -4px rgba(30,58,138,0.12), 0 2px 6px -2px rgba(30,58,138,0.06)',
        'card-hover': '0 10px 24px -8px rgba(30,58,138,0.18), 0 4px 10px -3px rgba(30,58,138,0.10)',
        'glow':       '0 0 0 4px rgba(251,191,36,0.18)',
      },
      animation: {
        'fade-in':        'fadeIn 0.25s ease-out',
        'slide-up':       'slideUp 0.3s ease-out',
        'slide-down':     'slideDown 0.3s ease-out',
        'scale-in':       'scaleIn 0.2s ease-out',
        'modal-scale-in': 'modalScaleIn 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
        'shimmer':        'shimmer 2s linear infinite',
        'pulse-glow':     'pulseGlow 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn:    { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp:   { '0%': { opacity: '0', transform: 'translateY(8px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        slideDown: { '0%': { opacity: '0', transform: 'translateY(-8px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        scaleIn:   { '0%': { opacity: '0', transform: 'scale(0.95)' }, '100%': { opacity: '1', transform: 'scale(1)' } },
        // Centered-modal variant. Radix Dialog uses
        // `top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2` for centering.
        // A keyframe animating only `transform: scale(...)` REPLACES that
        // translate during the run, which slams the dialog to the upper-left
        // for a frame before snapping centred. We bake the translate into
        // both stops so the modal stays centred while it scales in.
        modalScaleIn: {
          '0%':   { opacity: '0', transform: 'translate(-50%, -50%) scale(0.96)' },
          '100%': { opacity: '1', transform: 'translate(-50%, -50%) scale(1)' },
        },
        shimmer:   { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        pulseGlow: { '0%, 100%': { boxShadow: '0 0 0 0 rgba(251,191,36,0.6)' }, '50%': { boxShadow: '0 0 0 8px rgba(251,191,36,0)' } },
      },
    },
  },
  plugins: [],
};
