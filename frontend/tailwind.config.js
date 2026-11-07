/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ivory: {
          DEFAULT: '#FBFBF9',
          warm: '#F7F6F1',
          cream: '#F4F2EC',
          dark: '#EAE7DD',
        },
        surface: {
          white: '#FFFFFF',
          linen: '#FCFCFA',
          muted: '#F5F4EE',
          subtle: '#FAF9F4',
        },
        charcoal: {
          950: '#0C0D0F',
          900: '#111215',
          800: '#1C1E23',
          700: '#2D3039',
          600: '#4B505C',
          500: '#6A707E',
          400: '#8E94A2',
          300: '#B6BAC4',
        },
        border: {
          hairline: '#EFECE5',
          DEFAULT: '#E6E3DA',
          strong: '#D4D0C3',
          dark: '#1C1E23',
        },
        near: {
          DEFAULT: '#00C076',
          green: '#00C076',
          dark: '#008752',
          light: '#EBF9F3',
          subtle: 'rgba(0, 192, 118, 0.08)',
          glow: 'rgba(0, 192, 118, 0.2)',
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      boxShadow: {
        'soft': '0 1px 3px rgba(17,18,21,0.02), 0 8px 24px -4px rgba(17,18,21,0.04)',
        'card': '0 1px 2px rgba(17,18,21,0.04), 0 4px 16px -2px rgba(17,18,21,0.03)',
        'elevation': '0 12px 36px -8px rgba(17,18,21,0.08), 0 2px 8px -2px rgba(17,18,21,0.03)',
        'ring-green': '0 0 0 2px #00C076',
      },
      letterSpacing: {
        tightest: '-0.04em',
        tighter: '-0.025em',
      }
    },
  },
  plugins: [],
}
