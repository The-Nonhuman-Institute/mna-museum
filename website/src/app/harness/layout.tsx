import type { Metadata } from "next";

/**
 * The bench is not part of the institution's public surface: it holds no
 * content, appears in no navigation, and must never be indexed.
 */
export const metadata: Metadata = {
  title: "Render harness",
  robots: { index: false, follow: false },
};

export default function HarnessLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
