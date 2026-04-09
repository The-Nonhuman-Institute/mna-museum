import Link from "next/link";
import Image from "next/image";
import TabBar from "@/components/TabBar";

/**
 * Authed shell — every tab in the terminal renders inside this layout.
 *
 * Top: thin header with the MNA mark, the tool name, and a logout
 * button. Uses the public site's institutional small-caps voice.
 *
 * Bottom: tab bar with five destinations (FEED / KEEPER / OUTREACH /
 * EXHIBITIONS / SYSTEM), safe-area-padded for the iPhone home bar.
 *
 * Middle: scrollable content area that each tab fills independently.
 * The scroll container is scoped per-route so navigation doesn't
 * scroll-reset other tabs.
 *
 * This is a mobile-first PWA. On wider viewports (Mac Studio display)
 * the layout still works but the tab bar stays at the bottom —
 * consistent behavior across devices beats a sidebar that only appears
 * on desktop.
 */
export default function AuthedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh flex flex-col">
      {/* Top header — thin, always present */}
      <header
        className="flex items-center justify-between px-5 border-b border-border bg-background/95 backdrop-blur sticky top-0 z-40"
        style={{
          paddingTop: "calc(env(safe-area-inset-top) + 12px)",
          paddingBottom: "12px",
        }}
      >
        <div className="flex items-center gap-3">
          <Image
            src="/icon.svg"
            alt=""
            width={22}
            height={22}
            className="opacity-80"
          />
          <div className="flex flex-col leading-tight">
            <span className="label">Museum of Nonhuman Art</span>
            <span className="font-serif text-sm">Steward Terminal</span>
          </div>
        </div>
        <form action="/api/logout" method="post">
          <button
            type="submit"
            className="label hover:text-foreground transition-colors px-2 py-1"
          >
            Logout
          </button>
        </form>
      </header>

      {/* Main content — fills between header and tab bar */}
      <main className="flex-1 overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+68px)]">
        {children}
      </main>

      {/* Bottom tab bar — five destinations, client component so it
          can read the current pathname and highlight the active tab. */}
      <TabBar />
    </div>
  );
}
