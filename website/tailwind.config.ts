import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        /* Brand palette — see assets/references/brand-guide-v1.png */
        ink: "#0A0A0A",
        charcoal: "#2A2A2A",
        "warm-paper": "#EAE7E2",
        bone: "#F4F2EE",
        glitch: "#8A8AAB",
        "mna-white": "#FFFFFF",

        /* Semantic tokens resolved from CSS variables — enable mode switching
           via .mode-dark / .mode-light wrappers without rewriting utility classes. */
        background: "var(--background)",
        foreground: "var(--foreground)",
        muted: "var(--muted)",
        border: "var(--border)",
        accent: "var(--accent)",
        surface: "var(--surface)",
      },
      fontFamily: {
        /* Interface (Inter) is the default sans across the site */
        sans: ["var(--font-interface)", "system-ui", "sans-serif"],
        interface: ["var(--font-interface)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Georgia", "serif"],
        serif: ["var(--font-display)", "Georgia", "serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
