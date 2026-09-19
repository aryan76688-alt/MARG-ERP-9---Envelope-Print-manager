/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
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
      },
    },
  },
  plugins: [],
}
