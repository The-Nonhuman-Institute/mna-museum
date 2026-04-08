import type { Config } from "tailwindcss";

/**
 * MNA Steward Terminal — Tailwind config.
 *
 * The palette is the dark-backstage inversion of the public site at
 * mnamuseum.org. Same institutional DNA (Cormorant Garamond serif for
 * headings, Geist Sans for body, Geist Mono for data), but palette and
 * density are tuned for an operator tool, not a museum.
 *
 * Public site palette (for reference, NOT used here):
 *   bg #f5f2ed · fg #1a1a1a · muted #8a8680 · border #d6d0c8
 *
 * Terminal palette:
 *   bg #0e0c0a     (deep warm near-black, echoing gallery backgrounds)
 *   surface #1a1815  (slightly elevated panels / feed items)
 *   fg #e8e0d2     (warm cream — same as wall labels inside the museum)
 *   muted #8a8580  (secondary / label text — mirrors public site muted)
 *   border #2a2520 (hairlines between surfaces)
 *
 * Functional accents (muted, never saturated):
 *   active #7BA393  (sage — same green the public site uses for visitor dot)
 *   attention #c9a26d (warm amber — needs-steward-action signal)
 *   error #9a5a4a  (rust — errors and failed jobs)
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0e0c0a",
        surface: "#1a1815",
        foreground: "#e8e0d2",
        muted: "#8a8580",
        border: "#2a2520",
        // Functional accents — muted, never saturated
        active: "#7BA393",    // sage — healthy / running
        attention: "#c9a26d", // amber — needs steward action
        error: "#9a5a4a",     // rust — failures
      },
      fontFamily: {
        // Public-site identity typefaces, carried through via CSS variables
        // loaded from next/font in app/layout.tsx.
        serif: ["var(--font-serif)", "Cormorant Garamond", "Georgia", "serif"],
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "Menlo", "monospace"],
      },
      letterSpacing: {
        // Small-caps label voice used throughout the terminal, matching
        // the public site's uppercase-tracking-0.2em-ish treatment.
        widest: "0.25em",
        tightest: "0.04em",
      },
      fontSize: {
        // Operator-tool sizes: smaller than the public site's reading sizes.
        "xxs": ["10px", { lineHeight: "14px" }],
        "xs-tight": ["11px", { lineHeight: "15px" }],
      },
      spacing: {
        // Safe-area-aware insets for iPhone notch and home bar, used by
        // the tab bar and top header.
        "safe-top": "env(safe-area-inset-top)",
        "safe-bottom": "env(safe-area-inset-bottom)",
      },
    },
  },
  plugins: [],
};

export default config;
