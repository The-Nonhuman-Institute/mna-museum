"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Bottom tab bar — five destinations, safe-area-padded for the iPhone
 * home bar. Client component so usePathname() can highlight the
 * active tab (full brightness foreground for active, muted for the
 * rest — no icons, no underline, no pills, consistent with the
 * institution's typographic-only voice).
 *
 * Labels are deliberately short: EXHIBITIONS renders as "SHOWS" on
 * mobile so the five tabs fit without ugly mid-word abbreviation.
 * All labels stay in Geist Mono uppercase to match the site's
 * small-caps institutional voice.
 */

const TABS: { href: string; label: string }[] = [
  { href: "/feed", label: "Feed" },
  { href: "/keeper", label: "Keeper" },
  { href: "/outreach", label: "Outreach" },
  { href: "/exhibitions", label: "Shows" },
  { href: "/system", label: "System" },
];

export default function TabBar() {
  const pathname = usePathname();
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur border-t border-border"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="grid grid-cols-5 h-14">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              // Slightly smaller type and tighter tracking than the
              // previous tabs — buys back the horizontal room the old
              // spacing stole. Active state uses full foreground
              // brightness; inactive stays muted. No icons.
              className={`flex items-center justify-center text-[9px] uppercase tracking-[0.18em] transition-colors ${
                active
                  ? "text-foreground"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
