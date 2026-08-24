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
        // ── Ink scale ────────────────────────────────────────────────────
        // The ONLY sanctioned text colors on public glass surfaces (besides
        // text-white on solid brand/banner overlays and the Pill tones):
        //   ink            headings, names, values
        //   ink-secondary  body copy and labels that carry content (~8:1)
        //   ink-tertiary   captions, meta, hints (≥4.5:1 at 14px on glass)
        //   ink-faint      DECORATION ONLY — chevrons, dividers, ghost icons
        ink: {
          DEFAULT: "rgba(244,246,251,0.95)",
          secondary: "rgba(244,246,251,0.72)",
          tertiary: "rgba(244,246,251,0.56)",
          faint: "rgba(244,246,251,0.40)",
        },
        surface: {
          deep: "#0b1020", // ring/cutout color for elements floating over glass
        },
      },
      fontFamily: {
        sans: ["var(--font-thai)", "system-ui", "-apple-system", "sans-serif"],
      },
      // Thai-friendly line-heights baked into the five allowed type steps
      // (Thai stacked vowels/tone marks clip below ~1.45). Display = xl bold,
      // section = base bold, body = sm/base, caption = xs. text-[10px]/[11px]
      // survive only inside the dock (documented exception).
      fontSize: {
        xs: ["0.75rem", { lineHeight: "1.5" }],
        sm: ["0.875rem", { lineHeight: "1.6" }],
        base: ["1rem", { lineHeight: "1.6" }],
        lg: ["1.125rem", { lineHeight: "1.55" }],
        xl: ["1.25rem", { lineHeight: "1.45" }],
      },
      maxWidth: {
        app: "520px",
      },
      // Radius tiers: xl (icon chips, small controls) · 2xl (inputs, buttons,
      // tiles) · 3xl (cards, hero, dock, sheets) · full (pills, dots).
      borderRadius: {
        "4xl": "2rem",
      },
      // Two sanctioned brand glows: `glow` (primary CTA) and `glow-sm`
      // (small raised elements — logo tile, avatar, dock center button).
      boxShadow: {
        glow: "0 0 0 1px rgba(10,132,255,0.5), 0 8px 30px -8px rgba(10,132,255,0.45)",
        "glow-sm": "0 6px 18px -8px rgba(10,132,255,0.8)",
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
        "rise-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.18s ease-out",
        "slide-up": "slide-up 0.28s cubic-bezier(0.32, 0.72, 0, 1)",
        "scale-in": "scale-in 0.2s cubic-bezier(0.32, 0.72, 0, 1)",
        // fill-mode both so a reduced-motion 0.01ms run still lands visible
        "rise-in": "rise-in 0.2s ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
