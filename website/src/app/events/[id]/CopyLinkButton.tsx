"use client";

/**
 * CopyLinkButton — copies the ceremony's canonical URL.
 *
 * Tiny client component: a single button that drops the current URL
 * onto the clipboard and shows a brief "copied" state. Used by the
 * "Share Event" sidebar card on /events/[id].
 */

import { useState } from "react";

export default function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard API may be unavailable in some contexts (Atlas,
      // iframes without permissions). Fail quietly — the URL is
      // also displayed on the address bar; user can copy it manually.
    }
  };

  return (
    <button
      onClick={onCopy}
      className="text-[10.5px] uppercase tracking-[0.22em] text-mna-white/85 hover:text-mna-white border-b border-mna-white/35 hover:border-mna-white pb-0.5"
    >
      {copied ? "Copied ✓" : "Copy Link"}
    </button>
  );
}
