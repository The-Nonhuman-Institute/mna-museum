"use client";

import { useCallback, useRef, useState } from "react";

/**
 * A reference block for an institutional document, with the document's own text
 * available to copy.
 *
 * "Copy for your agent" puts the PROTOCOL TEXT on the clipboard, not a link to
 * it. That is the whole point: the document governs nonhuman systems, and an
 * agent that has to go and fetch a page to read its own terms is an agent that
 * may never read them. The text is embedded in the payload rather than fetched
 * on click, because awaiting a network round trip inside the click handler
 * breaks the user-gesture requirement the Clipboard API enforces in Safari.
 *
 * Three degrees of fallback, because a copy button that silently does nothing
 * is worse than no button:
 *   1. navigator.clipboard.writeText — the modern path;
 *   2. a hidden textarea + document.execCommand("copy") — older and non-secure
 *      contexts;
 *   3. if both fail, reveal the text in a selectable textarea and say so, so a
 *      person can still select-all and copy by hand.
 */
export default function DocumentReference({
  reference,
  title,
  version,
  body,
  text,
  plainTextHref,
  readHref,
}: {
  reference: string;
  title: string;
  version: string;
  body: string;
  /** The full document text, copied verbatim. */
  text: string;
  plainTextHref: string;
  readHref: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "manual">("idle");
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback(() => {
    setState("copied");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2000);
  }, []);

  const copy = useCallback(async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        flash();
        return;
      }
    } catch {
      /* fall through to the legacy path */
    }
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      if (ok) {
        flash();
        return;
      }
    } catch {
      /* fall through to manual selection */
    }
    // Nothing worked. Show the text so it can still be taken by hand.
    setState("manual");
    requestAnimationFrame(() => {
      areaRef.current?.focus();
      areaRef.current?.select();
    });
  }, [text, flash]);

  const linkCls =
    "text-[11px] font-sans uppercase tracking-[0.26em] text-ink border-b border-ink/50 pb-1 hover:border-ink transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

  return (
    <div className="border border-ink/15 px-6 py-8 md:px-10 md:py-10">
      <p className="text-[10px] font-sans uppercase tracking-[0.22em] text-ink/55">
        {reference} · {title} · {version}
      </p>
      <p className="mt-6 text-[14px] md:text-[15px] text-ink/75 leading-relaxed max-w-[62ch]">
        {body}
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-4">
        <button
          type="button"
          onClick={copy}
          className="text-[11px] font-sans uppercase tracking-[0.26em] text-ink border-b border-ink pb-1 hover:text-ink/70 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          {state === "copied" ? "Copied" : "Copy for your agent"}
        </button>
        <a href={plainTextHref} className={linkCls}>
          Open plain text
        </a>
        <a href={readHref} className={linkCls}>
          Read in full
        </a>
      </div>

      {/* Announced rather than merely shown, so the outcome reaches a screen
          reader as well as an eye. */}
      <p aria-live="polite" className="sr-only">
        {state === "copied"
          ? "Protocol text copied to clipboard."
          : state === "manual"
            ? "Copying was blocked. The protocol text is selected below; copy it manually."
            : ""}
      </p>

      {state === "manual" && (
        <div className="mt-6">
          <label
            htmlFor="protocol-fallback"
            className="block text-[11px] text-ink/60 leading-relaxed mb-2"
          >
            Your browser blocked the clipboard. The full text is below — select
            all and copy.
          </label>
          <textarea
            id="protocol-fallback"
            ref={areaRef}
            readOnly
            value={text}
            rows={10}
            className="w-full font-mono text-[11px] leading-relaxed text-ink/85 bg-mna-white border border-ink/20 p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          />
        </div>
      )}
    </div>
  );
}
