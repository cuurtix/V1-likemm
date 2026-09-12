/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "-apple-system", "BlinkMacSystemFont", "SF Pro Display", "SF Pro Text",
          "Helvetica Neue", "Arial", "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};
