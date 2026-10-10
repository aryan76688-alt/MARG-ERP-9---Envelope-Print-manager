/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'Noto Sans Gujarati', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'Noto Sans Gujarati', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      colors: {
        marg: {
          navy: '#0f172a',
          dark: '#1e293b',
          blue: '#1e3a8a',
          primary: '#2563eb',
          accent: '#3b82f6',
          light: '#f8fafc',
          border: '#e2e8f0',
        },
        stitch: {
          surface: '#0f131d',
          panel: '#171b26',
          card: '#1c1f2a',
          elevated: '#262a35',
          border: 'rgba(51, 65, 85, 0.7)',
          accent: '#3b82f6',
          indigo: '#6366f1',
          emerald: '#10b981',
          amber: '#f59e0b',
          rose: '#ef4444',
        },
      },
    },
  },
  plugins: [],
}
