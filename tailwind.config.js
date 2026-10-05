/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    // The engine builds panel and marker markup as HTML strings, and those
    // strings are full of Tailwind classes — they must be scanned too, or the
    // classes they use get purged out of the build.
    './src/**/*.{js,jsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
