"use client";

import Link from "next/link";
import { useState } from "react";

interface DropdownItem {
  label: string;
  href: string;
}

export default function NavDropdown({
  label,
  items,
}: {
  label: string;
  items: DropdownItem[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        className="text-[13px] tracking-wide uppercase transition-colors text-[var(--muted)] hover:text-[var(--foreground)]"
      >
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
