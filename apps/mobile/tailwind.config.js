/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // sysdojo palette — indigo primary, amber accent for streak/XP
        primary: {
          50: "#eef2ff",
          100: "#e0e7ff",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
        },
        accent: {
          400: "#fbbf24",
          500: "#f59e0b",
        },
        success: "#22c55e",
        danger: "#ef4444",
      },
    },
  },
  plugins: [],
};
