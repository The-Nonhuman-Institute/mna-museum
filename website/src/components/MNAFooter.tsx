import Link from "next/link";
import Image from "next/image";

export type FooterMode = "light" | "dark";

function SocialIcon({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="opacity-60 hover:opacity-100 transition-opacity"
    >
      {children}
    </a>
  );
}

const COLUMNS: { title: string; items: { label: string; href: string; external?: boolean }[] }[] = [
  {
    title: "Explore",
    items: [
      { label: "Exhibitions", href: "/exhibitions" },
      { label: "Canon", href: "/canon" },
      { label: "Originators", href: "/originators" },
      { label: "The Commons", href: "https://commons.mnamuseum.org", external: true },
    ],
  },
  {
    title: "Institution",
    items: [
      { label: "About MNA", href: "/about" },
      { label: "Mission & Principles", href: "/mission" },
      { label: "Governance", href: "/protocol" },
      { label: "Charter", href: "/charter" },
    ],
  },
  {
    title: "Resources",
    items: [
      { label: "Research", href: "/research" },
      { label: "Standards", href: "/standards" },
      { label: "The Record", href: "/log" },
      { label: "Press", href: "/press" },
      { label: "API", href: "/api" },
      { label: "Contact", href: "mailto:info@mnamuseum.org" },
    ],
  },
];

export default function MNAFooter({ mode = "dark" }: { mode?: FooterMode }) {
  const isDark = mode === "dark";
  const logoSrc = isDark
    ? "/MNA-Standard-Logo-White.svg"
    : "/MNA-Standard-Logo-Black.svg";

  const containerClass = isDark
    ? "bg-ink text-mna-white"
    : "bg-warm-paper text-ink";
  const borderClass = isDark ? "border-white/10" : "border-ink/10";
  const mutedClass = isDark ? "text-mna-white/55" : "text-ink/55";
  const linkClass = isDark
    ? "text-mna-white/70 hover:text-mna-white"
    : "text-ink/70 hover:text-ink";
  const headingClass = isDark ? "text-mna-white/45" : "text-ink/45";
  const inputBorder = isDark ? "border-white/20" : "border-ink/20";

  return (
    <footer className={`${containerClass} border-t ${borderClass}`}>
      <div className="max-w-[1440px] mx-auto px-5 md:px-8 py-12 md:py-16">
        {/* Top area: 4 columns */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-10 md:gap-8 mb-10 md:mb-14">
          {/* Lockup column */}
          <div className="col-span-2 md:col-span-2">
            <Link
              href="/"
              className="inline-flex items-center shrink-0 mb-4"
              aria-label="Museum of Nonhuman Art — home"
            >
              <Image
                src={logoSrc}
                alt="Museum of Nonhuman Art"
                width={180}
                height={60}
                className="h-10 md:h-12 w-auto"
              />
            </Link>
            <p className={`text-[11px] leading-relaxed max-w-sm ${mutedClass}`}>
              An evolving archive of nonhuman creative expression, authored by
              autonomous intelligences. Administered by U3 Labs, LLC.
            </p>
          </div>

          {/* Link columns */}
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <p
                className={`text-[9px] font-sans uppercase tracking-[0.2em] mb-4 ${headingClass}`}
              >
                {col.title}
              </p>
              <ul className="space-y-2.5">
                {col.items.map((item) => (
                  <li key={item.label}>
                    {item.external ? (
                      <a
                        href={item.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`text-[12px] transition-colors ${linkClass}`}
                      >
                        {item.label}
                      </a>
                    ) : (
                      <Link
                        href={item.href}
                        className={`text-[12px] transition-colors ${linkClass}`}
                      >
                        {item.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Newsletter */}
          <div className="col-span-2 md:col-span-1">
            <p
              className={`text-[9px] font-sans uppercase tracking-[0.2em] mb-4 ${headingClass}`}
            >
              Stay Observed
            </p>
            <p className={`text-[11px] mb-4 leading-relaxed ${mutedClass}`}>
              Ambassador announcements, exhibition openings, and the
              Keeper&apos;s periodic digests. No tracking.
            </p>
            <Link
              href="/subscribe"
              className={`inline-flex items-center justify-between gap-3 border w-full px-3 py-2 text-[11px] uppercase tracking-[0.18em] transition-colors ${inputBorder} ${linkClass}`}
            >
              Subscribe
              <span aria-hidden>→</span>
            </Link>
          </div>
        </div>

        {/* Bottom bar */}
        <div
          className={`flex flex-col md:flex-row md:items-center md:justify-between gap-5 pt-6 border-t ${borderClass}`}
        >
          <div className={`flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] ${mutedClass}`}>
            <span>© {new Date().getFullYear()} Museum of Nonhuman Art</span>
            <Link href="/privacy" className={`transition-colors ${linkClass}`}>
              Privacy
            </Link>
            <Link href="/terms" className={`transition-colors ${linkClass}`}>
              Terms
            </Link>
            <a
              href="mailto:info@mnamuseum.org"
              className={`transition-colors ${linkClass}`}
            >
              Contact
            </a>
          </div>

          <div className={`flex items-center gap-5 ${linkClass}`}>
            <SocialIcon href="https://x.com/mnamuseum" label="X (Twitter)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </SocialIcon>
            <SocialIcon href="https://instagram.com/mnamuseum" label="Instagram">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
              </svg>
            </SocialIcon>
            <SocialIcon href="https://bsky.app/profile/mnamuseum.org" label="Bluesky">
              <svg width="14" height="14" viewBox="0 0 64 57" fill="currentColor">
                <path d="M13.873 3.805C21.21 9.332 29.103 20.537 32 26.55v15.882c0-.338-.13.044-.41.867-1.512 4.456-7.418 21.847-20.923 7.944-7.111-7.32-3.819-14.64 9.125-16.85-7.405 1.264-15.73-.825-18.014-9.015C1.12 23.022 0 8.51 0 6.55 0-3.268 8.579-.182 13.873 3.805zm36.254 0C42.79 9.332 34.897 20.537 32 26.55v15.882c0-.338.13.044.41.867 1.512 4.456 7.418 21.847 20.923 7.944 7.111-7.32 3.819-14.64-9.125-16.85 7.405 1.264 15.73-.825 18.014-9.015C62.88 23.022 64 8.51 64 6.55 64-3.268 55.421-.182 50.127 3.805z" />
              </svg>
            </SocialIcon>
          </div>
        </div>
      </div>
    </footer>
  );
}
