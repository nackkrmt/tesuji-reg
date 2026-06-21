import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Apple system-blue accent ramp (used app-wide via `brand-*`)
        brand: {
          50: "#eef6ff",
          100: "#d9ecff",
          200: "#b6dbff",
          300: "#84c2ff",
          400: "#4aa3ff",
          500: "#1e88ff",
          600: "#0a84ff", // primary accent (iOS dark blue)
          700: "#0071e3", // apple web blue
          800: "#0059b8",
          900: "#06408a",
          950: "#04275a",
        },
        // Semantic, CSS-variable backed
        accent: "rgb(var(--accent) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-thai)", "system-ui", "-apple-system", "sans-serif"],
      },
      maxWidth: {
        app: "520px",
      },
      borderRadius: {
        "4xl": "2rem",
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(10,132,255,0.5), 0 8px 30px -8px rgba(10,132,255,0.45)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-up": {
          from: { transform: "translateY(100%)" },
          to: { transform: "translateY(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "translateY(8px) scale(0.98)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.18s ease-out",
        "slide-up": "slide-up 0.28s cubic-bezier(0.32, 0.72, 0, 1)",
        "scale-in": "scale-in 0.2s cubic-bezier(0.32, 0.72, 0, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
