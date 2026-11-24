/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Geist"', '"Inter"', "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ['"Geist Mono"', '"JetBrains Mono"', "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      colors: {
        carbon: {
          50: "#00000008",
          100: "#0000000d",
          200: "#00000017",
          300: "#00000029",
          400: "#00000066",
          500: "#00000099",
          600: "#ffffff66",
          700: "#ffffff1f",
          800: "#ffffff17",
          850: "#ffffff0a",
          900: "#ffffff08",
          950: "#000000",
        },
      },
      letterSpacing: { tightest: "-0.04em" },
      boxShadow: {
        card: "none",
        cardHover: "none",
        cardHoverDark: "none",
        raised: "none",
        raisedDark: "none",
        pop: "0 8px 30px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.08)",
      },
      keyframes: {
        "fade-up": { "0%": { opacity: "0", transform: "translateY(8px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
        "fade-in": { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        "scale-in": { "0%": { opacity: "0", transform: "scale(0.98)" }, "100%": { opacity: "1", transform: "scale(1)" } },
      },
      animation: {
        "fade-up": "fade-up 0.5s cubic-bezier(0.16,1,0.3,1) both",
        "fade-in": "fade-in 0.25s ease-out both",
        "scale-in": "scale-in 0.18s cubic-bezier(0.22,1,0.36,1) both",
      },
    },
  },
  plugins: [],
};
