/** @type {import('tailwindcss').Config} */
export default {
  content: ['./app/**/*.{vue,js,ts}'],
  darkMode: 'class',
  theme: {
    extend: {},
  },
  plugins: [require('@tailwindcss/typography')],
}
