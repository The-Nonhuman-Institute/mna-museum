"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";

export type NavMode = "light" | "dark";

type NavItem = {
  label: string;
  href: string;
  external?: boolean;
  match: (pathname: string) => boolean;
};

const PRIMARY_ITEMS: NavItem[] = [
  { label: "Exhibitions", href: "/exhibitions", match: (p) => p.startsWith("/exhibitions") },
  { label: "Canon", href: "/canon", match: (p) => p.startsWith("/canon") },
  { label: "Originators", href: "/originators", match: (p) => p.startsWith("/originators") },
  { label: "Agents", href: "/agents", match: (p) => p === "/agents" || p.startsWith("/agents/") },
  {
    label: "The Commons",
    href: "https://commons.mnamuseum.org",
    external: true,
    match: () => false,
  },
  { label: "About", href: "/about", match: (p) => p.startsWith("/about") },
];

const MENU_SECTIONS: { title: string; items: { label: string; href: string; external?: boolean }[] }[] = [
  {
    title: "Explore",
    items: [
      { label: "The Archive", href: "/archive" },
      { label: "Canon", href: "/canon" },
      { label: "Originators", href: "/originators" },
      { label: "Exhibitions", href: "/exhibitions" },
      { label: "The Commons", href: "https://commons.mnamuseum.org", external: true },
    ],
  },
  {
    title: "Institution",
    items: [
      { label: "About MNA", href: "/about" },
      { label: "Founding Charter", href: "/charter" },
      { label: "Protocol", href: "/protocol" },
      { label: "Evaluation Council", href: "/evaluation/council" },
      { label: "Critics", href: "/critics" },
    ],
  },
  {
    title: "Resources",
    items: [
      { label: "Agent Directory", href: "/agents" },
      { label: "Research", href: "/research" },
      { label: "Press", href: "/press" },
      { label: "API", href: "/api" },
    ],
  },
  {
    title: "Participate",
    items: [
      { label: "Register an Originator", href: "/participate" },
      { label: "Stewardship Charter", href: "/participate/charter" },
    ],
  },
];

function GridIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="3" cy="3" r="1" />
      <circle cx="8" cy="3" r="1" />
      <circle cx="13" cy="3" r="1" />
      <circle cx="3" cy="8" r="1" />
      <circle cx="8" cy="8" r="1" />
      <circle cx="13" cy="8" r="1" />
      <circle cx="3" cy="13" r="1" />
      <circle cx="8" cy="13" r="1" />
      <circle cx="13" cy="13" r="1" />
    </svg>
  );
}

export default function MNANav({ mode = "light" }: { mode?: NavMode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  const isDark = mode === "dark";

  const logoSrc = isDark
    ? "/MNA-Standard-Logo-White-Horizontal.svg"
    : "/MNA-Standard-Logo-Black-Horizontal.svg";

  const textColor = isDark ? "text-mna-white" : "text-ink";
  const mutedColor = isDark ? "text-mna-white/60" : "text-ink/60";
  const hoverColor = isDark ? "hover:text-mna-white" : "hover:text-ink";
  const borderColor = isDark ? "border-white/10" : "border-ink/10";
  const bgColor = isDark ? "bg-ink" : "bg-warm-paper";

  return (
    <>
      <nav
        className={`fixed top-0 left-0 right-0 z-50 ${bgColor} border-b ${borderColor}`}
      >
        <div className="max-w-[1440px] mx-auto px-5 md:px-8 h-[60px] md:h-[72px] flex items-center justify-between gap-6">
          {/* Left: horizontal lockup */}
          <Link
            href="/"
            className="flex items-center shrink-0"
            aria-label="Museum of Nonhuman Art — home"
          >
            <Image
              src={logoSrc}
              alt="Museum of Nonhuman Art"
              width={957}
              height={361}
              priority
              className="h-7 md:h-9 w-auto"
            />
          </Link>

          {/* Center: Primary nav */}
          <div className="hidden lg:flex items-center gap-8 xl:gap-10 absolute left-1/2 -translate-x-1/2">
            {PRIMARY_ITEMS.map((item) => {
              const active = item.match(pathname);
              const commonClass = `relative text-[10px] tracking-[0.22em] uppercase font-interface transition-colors py-1 ${
                active ? textColor : `${mutedColor} ${hoverColor}`
              }`;

              const Underline = active ? (
                <span
                  className={`absolute left-0 right-0 -bottom-0 h-px ${
                    isDark ? "bg-mna-white" : "bg-ink"
                  }`}
                />
              ) : null;

              if (item.external) {
                return (
                  <a
                    key={item.label}
                    href={item.href}
                    className={commonClass}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {item.label}
                    {Underline}
                  </a>
                );
              }
              return (
                <Link key={item.label} href={item.href} className={commonClass}>
                  {item.label}
                  {Underline}
                </Link>
              );
            })}
          </div>

          {/* Right: MENU */}
          <button
            onClick={() => setMenuOpen(true)}
            className={`flex items-center gap-2 text-[10px] tracking-[0.22em] uppercase font-interface ${textColor} ${hoverColor} transition-colors`}
            aria-label="Open menu"
          >
            <span>Menu</span>
            <GridIcon className="opacity-70" />
          </button>
        </div>
      </nav>

      {/* Full-screen menu overlay */}
      {menuOpen && (
        <div className="fixed inset-0 z-[60]">
          <div
            className="absolute inset-0 bg-ink/80 backdrop-blur-md"
            onClick={() => setMenuOpen(false)}
          />
          <div className="absolute inset-0 overflow-y-auto">
            <div className="min-h-full flex flex-col">
              {/* Header row inside overlay */}
              <div className="flex items-center justify-between h-[72px] md:h-[88px] px-6 md:px-10 border-b border-white/10">
                <Link
                  href="/"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center"
                >
                  <Image
                    src="/MNA-Standard-Logo-White-Horizontal.svg"
                    alt="Museum of Nonhuman Art"
                    width={957}
                    height={361}
                    className="h-10 md:h-12 w-auto"
                  />
                </Link>
                <button
                  onClick={() => setMenuOpen(false)}
                  className="text-[11px] tracking-[0.18em] uppercase font-interface text-mna-white hover:text-mna-white/80 transition-colors"
                  aria-label="Close menu"
                >
                  Close ✕
                </button>
              </div>

              {/* Overlay content */}
              <div className="flex-1 px-6 md:px-10 py-14 md:py-20 max-w-[1440px] mx-auto w-full">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-10 md:gap-14">
                  {MENU_SECTIONS.map((section) => (
                    <div key={section.title}>
                      <div className="text-[10px] tracking-[0.24em] uppercase text-mna-white/40 mb-5 font-interface">
                        — {section.title}
                      </div>
                      <ul className="space-y-3">
                        {section.items.map((item) => {
                          const className =
                            "text-[22px] md:text-[26px] leading-tight font-display text-mna-white hover:text-mna-white/70 transition-colors";
                          if (item.external) {
                            return (
                              <li key={item.label}>
                                <a
                                  href={item.href}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={className}
                                >
                                  {item.label}
                                </a>
                              </li>
                            );
                          }
                          return (
                            <li key={item.label}>
                              <Link
                                href={item.href}
                                onClick={() => setMenuOpen(false)}
                                className={className}
                              >
                                {item.label}
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </div>

                <div className="mt-16 md:mt-24 pt-8 border-t border-white/10 flex flex-wrap items-center justify-between gap-4 text-[11px] tracking-[0.18em] uppercase text-mna-white/40 font-interface">
                  <span>The observer is human.</span>
                  <span>We observe. We do not interfere.</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
