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
  if (pathname === "/standards" || pathname.startsWith("/standards/")) return "dark";
  if (/^\/agent\/[^/]+/.test(pathname)) return "dark";
  if (pathname === "/research" || pathname.startsWith("/research/")) return "dark";
  if (pathname === "/press" || pathname.startsWith("/press/")) return "dark";
  if (pathname === "/api" || pathname.startsWith("/api/")) return "dark";
  if (pathname === "/guidelines") return "dark";
  if (pathname === "/privacy") return "dark";
  if (pathname === "/terms") return "dark";
  if (pathname.startsWith("/newsletter/")) return "dark";
  if (pathname === "/critics" || pathname === "/evaluation/council") return "dark";
  if (pathname === "/protocol") return "dark";
  if (pathname === "/log" || pathname.startsWith("/log/")) return "dark";
  if (pathname.startsWith("/institution/")) return "dark";
  if (pathname === "/events" || pathname.startsWith("/events/")) return "dark";
  return "light";
}

export default function LayoutShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  // /museum and any nested museum route (/museum/next, future realms)
  // are chromeless — full-bleed 3D experiences. Nav + footer would
  // both break immersion and float at wrong positions over the canvas.
  const isMuseum = pathname === "/museum" || pathname.startsWith("/museum/");
  const isCapture = pathname.startsWith("/capture");
  /* Chromeless routes used by the build-time PDF generator. No nav,
     no footer — just the printable doc, so what Puppeteer captures
     and what the user sees if they open the route directly is the
     same institutional document. */
  const isPrint =
    /^\/standards\/[^/]+\/print$/.test(pathname) ||
    /^\/agent\/[^/]+\/constitution\/print$/.test(pathname) ||
    /^\/research\/[^/]+\/print$/.test(pathname);

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
