/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      maxWidth: { page: "1120px" },
      colors: {
        ink: "#08090d",
        phosphor: "#d6ff5c",
        mute: "#a39b8c",
        paper: "#f4efe6",
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        lift: "0 24px 40px -28px rgba(0,0,0,.9)",
      },
    },
  },
  plugins: [],
};
