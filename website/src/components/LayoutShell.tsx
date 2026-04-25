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

  if (isMuseum || isCapture) {
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
