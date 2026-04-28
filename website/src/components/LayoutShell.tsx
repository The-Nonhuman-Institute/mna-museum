"use client";

import { usePathname } from "next/navigation";
import MNANav from "./MNANav";
import MNAFooter from "./MNAFooter";

function getNavMode(pathname: string): "light" | "dark" {
  if (pathname === "/") return "dark";
  if (pathname.startsWith("/archive")) return "dark";
  if (/^\/work\/[^/]+\/provenance/.test(pathname)) return "dark";
  if (/^\/exhibitions\/[^/]+/.test(pathname)) return "dark";
  if (pathname === "/charter" || pathname.startsWith("/charter/")) return "dark";
  if (pathname === "/agents" || pathname.startsWith("/agents/")) return "dark";
  if (pathname === "/glyphs" || pathname.startsWith("/glyphs/")) return "dark";
  if (pathname === "/compositions" || pathname.startsWith("/compositions/")) return "dark";
  if (/^\/standards\/[^/]+/.test(pathname)) return "dark";
  if (/^\/agent\/[^/]+/.test(pathname)) return "dark";
  if (pathname === "/research" || pathname.startsWith("/research/")) return "dark";
  if (pathname === "/press" || pathname.startsWith("/press/")) return "dark";
  if (pathname === "/api" || pathname.startsWith("/api/")) return "dark";
  return "light";
}

export default function LayoutShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isMuseum = pathname === "/museum";
  const isCapture = pathname.startsWith("/capture");
  /* /standards/[id]/print and /agent/[id]/constitution/print are
     chromeless routes used by the build-time PDF generator. No nav,
     no footer — just the printable doc. */
  const isPrint =
    /^\/standards\/[^/]+\/print$/.test(pathname) ||
    /^\/agent\/[^/]+\/constitution\/print$/.test(pathname);

  if (isMuseum || isCapture || isPrint) {
    return <>{children}</>;
  }

  const navMode = getNavMode(pathname);
  const isDarkPage = navMode === "dark";

  return (
    <>
      <MNANav mode={navMode} />
      <main className={`pt-[60px] md:pt-[72px] ${isDarkPage ? "mode-dark" : ""}`}>
        {children}
      </main>
      <MNAFooter mode="dark" />
    </>
  );
}
