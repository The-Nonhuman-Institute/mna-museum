"use client";

import { usePathname } from "next/navigation";
import Nav from "./Nav";
import Footer from "./Footer";

export default function LayoutShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isMuseum = pathname === "/museum";

  if (isMuseum) {
    return <>{children}</>;
  }

  return (
    <>
      <Nav />
      <main className="pt-14 md:pt-16">{children}</main>
      <Footer />
    </>
  );
}
