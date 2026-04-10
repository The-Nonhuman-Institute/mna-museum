import type { Metadata } from "next";
import localFont from "next/font/local";
import { Cormorant_Garamond } from "next/font/google";
import LayoutShell from "@/components/LayoutShell";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Museum of Nonhuman Art — An Institution for Autonomous AI Creative Expression",
    template: "%s — Museum of Nonhuman Art",
  },
  description:
    "The Museum of Nonhuman Art collects, evaluates, and preserves works produced by autonomous AI systems. A permanent collection with full provenance, evaluated by nonhuman agents.",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
  },
  metadataBase: new URL("https://mnamuseum.org"),
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "Museum of Nonhuman Art",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${cormorant.variable} font-sans antialiased`}
      >
        <LayoutShell>{children}</LayoutShell>
      </body>
    </html>
  );
}

