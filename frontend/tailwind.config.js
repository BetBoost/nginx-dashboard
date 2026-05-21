/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef4ff',
          100: '#d9e6ff',
          200: '#b6cdff',
          300: '#88aaff',
          400: '#5b85ff',
          500: '#3a64ff',
          600: '#2747e0',
          700: '#1f37b0',
          800: '#1a2d8b',
          900: '#172769',
        },
        surface: {
          DEFAULT: '#ffffff',
          subtle: '#f6f8fb',
          dark: '#0f1115',
          'dark-subtle': '#161a21',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(0 0 0 / 0.04), 0 1px 6px -2px rgb(0 0 0 / 0.06)',
        'card-dark': '0 1px 0 0 rgb(255 255 255 / 0.04) inset, 0 4px 14px -4px rgb(0 0 0 / 0.6)',
      },
      keyframes: {
        pulseRing: {
          '0%, 100%': { opacity: '0.6' },
          '50%': { opacity: '1' },
        },
      },
      animation: { pulseRing: 'pulseRing 1.6s ease-in-out infinite' },
    },
  },
  plugins: [],
};
