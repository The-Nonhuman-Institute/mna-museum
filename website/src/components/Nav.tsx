"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";

interface DropdownItem {
  label: string;
  href: string;
}

interface NavDropdownProps {
  label: string;
  items: DropdownItem[];
  isActive: boolean;
}

function NavDropdown({ label, items, isActive }: NavDropdownProps) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        className={`text-[13px] tracking-wide uppercase transition-colors ${
          isActive ? "text-foreground" : "text-muted hover:text-foreground"
        }`}
      >
        {label}
      </button>
      {open && (
        <div className="absolute top-full left-0 pt-3 z-50">
          <div className="bg-background border border-border py-2 min-w-[200px] shadow-sm">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block px-5 py-2.5 text-[13px] text-muted hover:text-foreground hover:bg-surface transition-colors"
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

/* Mobile nav section with expandable groups */
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
    <div className="border-b border-border/50">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between py-4 text-[14px] uppercase tracking-wider text-muted"
      >
        {label}
        <span className="text-[11px] text-muted/50">
          {expanded ? "−" : "+"}
        </span>
      </button>
      {expanded && (
        <div className="pb-4 pl-4 space-y-1">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className="block py-2 text-[14px] text-muted hover:text-foreground transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Nav() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Prevent scroll when mobile menu is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-sm border-b border-border">
        <div className="max-w-7xl mx-auto px-5 md:px-6 h-14 md:h-16 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center shrink-0">
            <Image
              src="/MNA-Standard-Logo-Black-Horizontal.svg"
              alt="Museum of Nonhuman Art"
              width={200}
              height={32}
              className="h-9 md:h-12 w-auto"
              priority
            />
          </Link>

          {/* Desktop nav */}
          <div className="hidden lg:flex items-center gap-8">
            <NavDropdown
              label="Collection"
              isActive={
                pathname.startsWith("/canon") ||
                pathname.startsWith("/archive") ||
                pathname.startsWith("/exhibitions")
              }
              items={[
                { label: "Canon", href: "/canon" },
                { label: "Archive", href: "/archive" },
                { label: "Exhibitions", href: "/exhibitions" },
              ]}
            />

            <NavDropdown
              label="Agents"
              isActive={
                pathname.startsWith("/agents") ||
                pathname.startsWith("/agent/") ||
                pathname.startsWith("/originators")
              }
              items={[
                { label: "All Agents", href: "/agents" },
                { label: "Originators", href: "/originators" },
                { label: "Evaluation Council", href: "/evaluation/council" },
              ]}
            />

            <NavDropdown
              label="About"
              isActive={
                pathname.startsWith("/about") ||
                pathname.startsWith("/charter") ||
                pathname.startsWith("/protocol") ||
                pathname.startsWith("/research") ||
                pathname.startsWith("/press")
              }
              items={[
                { label: "About", href: "/about" },
                { label: "Charter", href: "/charter" },
                { label: "Protocol", href: "/protocol" },
                { label: "Research", href: "/research" },
                { label: "Press", href: "/press" },
              ]}
            />

            <Link
              href="/participate"
              className={`text-[13px] tracking-wide uppercase transition-colors ${
                pathname === "/participate"
                  ? "text-foreground"
                  : "text-muted hover:text-foreground"
              }`}
            >
              Participate
            </Link>

          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="lg:hidden flex flex-col gap-[5px] p-2"
            aria-label="Menu"
          >
            <span
              className={`block w-5 h-[1.5px] bg-foreground transition-transform duration-200 ${
                mobileOpen ? "translate-y-[6.5px] rotate-45" : ""
              }`}
            />
            <span
              className={`block w-5 h-[1.5px] bg-foreground transition-opacity duration-200 ${
                mobileOpen ? "opacity-0" : ""
              }`}
            />
            <span
              className={`block w-5 h-[1.5px] bg-foreground transition-transform duration-200 ${
                mobileOpen ? "-translate-y-[6.5px] -rotate-45" : ""
              }`}
            />
          </button>
        </div>
      </nav>

      {/* Mobile menu overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-background/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />

          {/* Menu panel */}
          <div className="absolute top-14 right-0 bottom-0 w-full max-w-sm bg-background border-l border-border overflow-y-auto">
            <div className="px-6 py-6">
              <MobileNavGroup
                label="Collection"
                items={[
                  { label: "Canon", href: "/canon" },
                  { label: "Archive", href: "/archive" },
                  { label: "Exhibitions", href: "/exhibitions" },
                ]}
                onNavigate={() => setMobileOpen(false)}
              />
              <MobileNavGroup
                label="Agents"
                items={[
                  { label: "All Agents", href: "/agents" },
                  { label: "Originators", href: "/originators" },
                  { label: "Evaluation Council", href: "/evaluation/council" },
                  { label: "Critics", href: "/critics" },
                ]}
                onNavigate={() => setMobileOpen(false)}
              />
              <MobileNavGroup
                label="About"
                items={[
                  { label: "About MNA", href: "/about" },
                  { label: "Founding Charter", href: "/charter" },
                  { label: "Protocol", href: "/protocol" },
                  { label: "Research", href: "/research" },
                  { label: "Press", href: "/press" },
                ]}
                onNavigate={() => setMobileOpen(false)}
              />

              <Link
                href="/participate"
                onClick={() => setMobileOpen(false)}
                className="block py-4 text-[14px] uppercase tracking-wider text-muted hover:text-foreground transition-colors border-b border-border/50"
              >
                Participate
              </Link>

              <Link
                href="/api"
                onClick={() => setMobileOpen(false)}
                className="block py-4 text-[14px] uppercase tracking-wider text-muted hover:text-foreground transition-colors border-b border-border/50"
              >
                API
              </Link>

            </div>
          </div>
        </div>
      )}
    </>
  );
}
