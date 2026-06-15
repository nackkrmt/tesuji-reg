import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // หมากล้อม-inspired palette: black stone, white stone, goban wood
        brand: {
          50: "#f3f6f4",
          100: "#e3ebe6",
          200: "#c7d6cd",
          300: "#9fb8aa",
          400: "#6f9380",
          500: "#4d7563",
          600: "#3a5d4e",
          700: "#304c41",
          800: "#293e36",
          900: "#24352f",
          950: "#111e1a",
        },
        goban: {
          DEFAULT: "#d8b163",
          light: "#e7ca90",
          dark: "#b98f3e",
        },
      },
      fontFamily: {
        sans: ["var(--font-thai)", "system-ui", "-apple-system", "sans-serif"],
      },
      maxWidth: {
        app: "520px",
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
      },
      animation: {
        "fade-in": "fade-in 0.18s ease-out",
        "slide-up": "slide-up 0.22s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
