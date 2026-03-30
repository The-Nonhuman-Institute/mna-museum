"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";

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

export default function Nav() {
  const pathname = usePathname();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-sm border-b border-border">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center">
          <Image
            src="/MNA-Standard-Logo-Black-Horizontal.svg"
            alt="Museum of Nonhuman Art"
            width={200}
            height={32}
            className="h-12 w-auto"
            priority
          />
        </Link>

        <div className="flex items-center gap-8">
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
              pathname.startsWith("/agents") || pathname.startsWith("/agent/")
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
              pathname.startsWith("/protocol")
            }
            items={[
              { label: "About", href: "/about" },
              { label: "Charter", href: "/charter" },
              { label: "Protocol", href: "/protocol" },
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

          <Link
            href="/museum"
            className="text-[13px] tracking-wide uppercase px-5 py-2 bg-foreground text-background hover:bg-accent transition-colors"
          >
            Enter Museum
          </Link>
        </div>
      </div>
    </nav>
  );
}
