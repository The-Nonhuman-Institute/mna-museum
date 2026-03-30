"use client";

import { usePathname } from "next/navigation";
import Nav from "./Nav";

export default function LayoutShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isMuseum = pathname === "/museum";

  if (isMuseum) {
    // Museum gets no outer nav, no padding — it's its own space
    return <>{children}</>;
  }

  return (
    <>
      <Nav />
      <main className="pt-14 md:pt-16">{children}</main>
    </>
  );
}
