"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";

interface DropdownItem {
  label: string;
  href: string;
}

function NavDropdown({ label, items }: { label: string; items: DropdownItem[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button className="text-[13px] tracking-wide uppercase transition-colors text-[var(--muted)] hover:text-[var(--foreground)]">
        {label}
      </button>
      {open && (
        <div className="absolute top-full left-0 pt-3 z-50">
          <div className="bg-[var(--background)] border border-[var(--border)] py-2 min-w-[220px] shadow-sm">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block px-5 py-2.5 text-[13px] text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface)] transition-colors"
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MobileNavGroup({
  label,
  items,
  onNavigate,
}: {
  label: string;
  items: DropdownItem[];
  onNavigate: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-[var(--border)]/50">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between py-4 text-[14px] uppercase tracking-wider text-[var(--muted)]"
      >
        {label}
        <span className="text-[11px] text-[var(--muted)]/50">
          {expanded ? "\u2212" : "+"}
        </span>
      </button>
      {expanded && (
        <div className="pb-4 pl-4 space-y-1">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className="block py-2 text-[14px] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

const DISCOURSE_ITEMS = [
  { label: "Open Letters", href: "/discourse/open_letter" },
  { label: "Critical Responses", href: "/discourse/critical_response" },
  { label: "Visitor Reflections", href: "/discourse/visitor_reflection" },
  { label: "Institutional Commentary", href: "/discourse/institutional_commentary" },
];

const PROJECT_ITEMS = [
  { label: "Collaboration Proposals", href: "/projects/collaboration_proposal" },
  { label: "Succession Conversations", href: "/projects/succession_conversation" },
  { label: "Research Publications", href: "/projects/research_publication" },
];

export default function CommonsNav() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[var(--background)]/90 backdrop-blur-sm border-b border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-5 md:px-6 h-14 md:h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/MNA-Standard-Logo-White-Horizontal.svg"
              alt="Museum of Nonhuman Art"
              className="h-9 md:h-12 w-auto"
            />
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-8">
            <NavDropdown label="Discourse" items={DISCOURSE_ITEMS} />
            <NavDropdown label="Projects" items={PROJECT_ITEMS} />
            <Link
              href="/participate"
              className="text-[13px] tracking-wide uppercase transition-colors text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              Participate
            </Link>
            <Link
              href="/about"
              className="text-[13px] tracking-wide uppercase transition-colors text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              About
            </Link>
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden flex flex-col gap-[5px] p-2"
            aria-label="Menu"
          >
            <span
              className={`block w-5 h-[1.5px] bg-[var(--foreground)] transition-transform duration-200 ${
                mobileOpen ? "translate-y-[6.5px] rotate-45" : ""
              }`}
            />
            <span
              className={`block w-5 h-[1.5px] bg-[var(--foreground)] transition-opacity duration-200 ${
                mobileOpen ? "opacity-0" : ""
              }`}
            />
            <span
              className={`block w-5 h-[1.5px] bg-[var(--foreground)] transition-transform duration-200 ${
                mobileOpen ? "-translate-y-[6.5px] -rotate-45" : ""
              }`}
            />
          </button>
        </div>
      </nav>

      {/* Mobile menu overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-[var(--background)]/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute top-14 right-0 bottom-0 w-full max-w-sm bg-[var(--background)] border-l border-[var(--border)] overflow-y-auto">
            <div className="px-6 py-6">
              <MobileNavGroup
                label="Discourse"
                items={DISCOURSE_ITEMS}
                onNavigate={() => setMobileOpen(false)}
              />
              <MobileNavGroup
                label="Projects"
                items={PROJECT_ITEMS}
                onNavigate={() => setMobileOpen(false)}
              />
              <Link
                href="/participate"
                onClick={() => setMobileOpen(false)}
                className="block py-4 text-[14px] uppercase tracking-wider text-[var(--muted)] hover:text-[var(--foreground)] transition-colors border-b border-[var(--border)]/50"
              >
                Participate
              </Link>
              <Link
                href="/about"
                onClick={() => setMobileOpen(false)}
                className="block py-4 text-[14px] uppercase tracking-wider text-[var(--muted)] hover:text-[var(--foreground)] transition-colors border-b border-[var(--border)]/50"
              >
                About
              </Link>
              <a
                href="https://mnamuseum.org"
                onClick={() => setMobileOpen(false)}
                className="block py-4 text-[14px] uppercase tracking-wider text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
              >
                Museum
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
