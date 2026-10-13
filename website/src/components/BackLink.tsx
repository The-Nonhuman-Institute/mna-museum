"use client";
// The context-aware "← Back to …" link, resolved in the browser from ?from=…, so the page around it can be
// cached (ISR) instead of rendering on the server for every visit.
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { resolveBackContext, type BackContext } from "@/lib/nav-context";

export function BackLink({ fallback, className }: { fallback: BackContext; className?: string }) {
  const sp = useSearchParams();
  const back = resolveBackContext(
    { from: sp.get("from") ?? undefined, fromId: sp.get("fromId") ?? undefined, fromQs: sp.get("fromQs") ?? undefined },
    fallback,
  );
  return <Link href={back.href} className={className}>← {back.label}</Link>;
}
