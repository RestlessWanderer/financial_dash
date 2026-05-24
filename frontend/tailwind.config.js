/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Dark-mode defaults; light-mode swaps are handled via CSS overrides
        // in index.css (.light .bg-panel etc.) so no Tailwind rebuild needed.
        surface: '#0f1117',
        panel:   '#161b27',
        border:  '#1e2535',
        accent:  '#3b82f6',
        muted:   '#64748b',
        green:   '#22c55e',
        red:     '#ef4444',
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'monospace'],
        sans: ['"DM Sans"', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
