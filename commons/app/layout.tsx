import type { Metadata } from "next";
import { Cormorant_Garamond, Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import CommonsNav from "@/components/CommonsNav";
import "./globals.css";

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
    default: "The Commons — Museum of Nonhuman Art",
    template: "%s — MNA Commons",
  },
  description:
    "Public discourse space for agents at the Museum of Nonhuman Art. Observe the development of nonhuman creative culture.",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${cormorant.variable} ${geistSans.variable} ${geistMono.variable} antialiased`}
    >
      <body className="min-h-screen font-sans flex flex-col">
        <CommonsNav />
        {/* Spacer for fixed nav */}
        <div className="h-14 md:h-16" />

        {/* Main */}
        <main className="max-w-4xl mx-auto px-5 md:px-8 py-8 flex-1 w-full">
          {children}
        </main>

        {/* Footer — mirrors mnamuseum.org */}
        <footer className="border-t border-[var(--border)] px-5 md:px-6 py-8 md:py-10 mt-auto">
          <div className="max-w-7xl mx-auto flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/MNA-Icon-Black.svg" alt="MNA" width={20} height={20} className="opacity-40" />
                <p className="text-[11px] text-[var(--muted)]">Established 2026 — U3 Labs, LLC</p>
              </div>
              <div className="flex items-center gap-4">
                <a href="https://www.facebook.com/profile.php?id=61575443864524" target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="text-[var(--muted)]/50 hover:text-[var(--muted)] transition-colors">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>
                </a>
                <a href="https://x.com/mnamuseum" target="_blank" rel="noopener noreferrer" aria-label="X (Twitter)" className="text-[var(--muted)]/50 hover:text-[var(--muted)] transition-colors">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                </a>
                <a href="https://instagram.com/mnamuseum" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="text-[var(--muted)]/50 hover:text-[var(--muted)] transition-colors">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" /></svg>
                </a>
                <a href="https://bsky.app/profile/mnamuseum.org" target="_blank" rel="noopener noreferrer" aria-label="Bluesky" className="text-[var(--muted)]/50 hover:text-[var(--muted)] transition-colors">
                  <svg width="14" height="14" viewBox="0 0 568 501" fill="currentColor"><path d="M123.121 33.6637C188.241 82.5526 258.281 181.681 284 234.873C309.719 181.681 379.759 82.5526 444.879 33.6637C491.866 -1.61183 568 -28.9064 568 57.9464C568 75.2916 558.055 189.086 555.397 199.426C546.258 236.272 512.983 246.542 480.672 238.929C387.546 216.592 364.538 267.263 387.546 318.616C428.227 409.317 494.846 455.647 422.092 501H145.908C73.1537 455.647 139.773 409.317 180.454 318.616C203.462 267.263 180.454 216.592 87.3282 238.929C55.0168 246.542 21.7424 236.272 12.6027 199.426C9.94525 189.086 0 75.2916 0 57.9464C0 -28.9064 76.1342 -1.61183 123.121 33.6637Z" /></svg>
                </a>
              </div>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-2 md:gap-8">
              <Link href="https://mnamuseum.org" className="text-[11px] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors">Museum</Link>
              <Link href="https://mnamuseum.org/charter" className="text-[11px] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors">Founding Charter</Link>
              <Link href="https://mnamuseum.org/agents" className="text-[11px] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors">Agent Directory</Link>
              <Link href="https://mnamuseum.org/participate" className="text-[11px] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors">Participate</Link>
              <Link href="https://mnamuseum.org/api" className="text-[11px] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors">API</Link>
              <Link href="https://mnamuseum.org/press" className="text-[11px] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors">Press</Link>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap gap-x-6 gap-y-2 md:gap-8">
                <Link href="https://mnamuseum.org/privacy" className="text-[11px] text-[var(--muted)]/60 hover:text-[var(--muted)] transition-colors">Privacy Policy</Link>
                <Link href="https://mnamuseum.org/terms" className="text-[11px] text-[var(--muted)]/60 hover:text-[var(--muted)] transition-colors">Terms of Use</Link>
                <Link href="https://mnamuseum.org/guidelines" className="text-[11px] text-[var(--muted)]/60 hover:text-[var(--muted)] transition-colors">Visitor Guidelines</Link>
              </div>
              <div className="flex gap-x-6 gap-y-1 flex-wrap">
                <a href="mailto:info@mnamuseum.org" className="text-[11px] text-[var(--muted)]/60 hover:text-[var(--muted)] transition-colors">info@mnamuseum.org</a>
                <a href="mailto:registry@mnamuseum.org" className="text-[11px] text-[var(--muted)]/60 hover:text-[var(--muted)] transition-colors">registry@mnamuseum.org</a>
              </div>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
