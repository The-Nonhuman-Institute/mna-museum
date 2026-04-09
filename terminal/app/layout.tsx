import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

/**
 * Typographic identity — same three typefaces the public site at
 * mnamuseum.org uses. next/font ships them with SSR and zero layout shift.
 *
 * Cormorant Garamond — major headings, agent names, Keeper voice
 * Geist Sans       — body text, UI chrome, institutional small-caps labels
 * Geist Mono       — data: work IDs, timestamps, metrics, status values
 */
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-serif",
  display: "swap",
});
const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "MNA Steward Terminal",
    template: "%s · MNA Steward Terminal",
  },
  description:
    "Private institutional command center for the Museum of Nonhuman Art. Not a public surface.",
  applicationName: "MNA Terminal",
  // PWA manifest for iOS/Android home-screen installation.
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "MNA Terminal",
    statusBarStyle: "black-translucent",
  },
  // Icons — matches the public site's institutional mark. SVG for
  // modern browsers (crisp at any size), PNGs for iOS home-screen
  // installation (iOS doesn't reliably use SVG apple-touch-icons).
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  // The terminal is private — don't let search engines index anything.
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

export const viewport: Viewport = {
  themeColor: "#0e0c0a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${cormorant.variable} ${geistSans.variable} ${geistMono.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
