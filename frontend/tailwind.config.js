/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
          950: '#172554',
        },
      },
      fontFamily: {
        sans:    ['Inter', 'sans-serif'],
        display: ['Outfit', 'sans-serif'],
      },
      boxShadow: {
        card:   '0 1px 3px rgba(0,0,0,0.05), 0 4px 16px rgba(0,0,0,0.03)',
        'card-hover': '0 8px 24px rgba(37,99,235,0.08), 0 4px 16px rgba(0,0,0,0.04)',
        glow: '0 0 20px rgba(37,99,235,0.18)',
        'glow-emerald': '0 0 20px rgba(16,185,129,0.18)',
        'glow-rose': '0 0 20px rgba(244,63,94,0.18)',
      },
    },
  },
  plugins: [],
}

