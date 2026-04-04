/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: '#08080F',
          secondary: '#0F0F1A',
          tertiary: '#141425',
        },
        border: '#1E1E32',
        accent: {
          DEFAULT: '#00C8E8',
          dim: 'rgba(0,200,232,0.12)',
        },
        txt: {
          primary: '#F0F0F5',
          secondary: '#8888A8',
          tertiary: '#4A4A6A',
        },
        success: '#00E5A0',
        warning: '#F0A500',
        danger: '#FF4D6A',
      },
      fontFamily: {
        display: ['Syne', 'sans-serif'],
        body: ['DM Sans', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};
