/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg:     '#141413',
        bg2:    '#1c1c1a',
        bg3:    '#242422',
        text2:  '#a3a39a',
        amber:  '#d4683c',
        teal:   '#2dd4bf',
        purple: '#a78bfa',
        blue:   '#60a5fa',
        green:  '#34d399',
        red:    '#f87171',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'sans-serif'],
        mono: ['"SF Mono"', '"Fira Code"', '"Cascadia Code"', 'monospace'],
      },
    },
  },
  plugins: [],
}
