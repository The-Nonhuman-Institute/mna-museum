"use client";

import { useEffect, useMemo, useRef, useState } from "react";

interface HtmlRendererProps {
  html: string;
  /** Detail/lightbox callers pass interactive=true. Card thumbnails get the
   *  motion-indicator dots; interactive surfaces don't. */
  interactive?: boolean;
}

/**
 * HtmlRenderer mounts the iframe lazily when its container enters (or is
 * within 300px of) the viewport. Once mounted it stays mounted.
 *
 * Sandbox: `allow-scripts` only. Dropping allow-same-origin gives each iframe
 * an opaque origin and a separate renderer process, so heavy init scripts in
 * one iframe can't block the parent's main thread.
 *
 * Compatibility shim: opaque-origin iframes can't access localStorage /
 * sessionStorage / document.cookie. Several Originator-authored payloads
 * call those (e.g. setInterval(saveState, 15000)). Without the shim, the
 * very first access throws SecurityError mid-init and the rest of the work
 * never runs — the iframe loads, prints "click to begin", then dies. The
 * shim provides an in-memory replacement so those works keep going. State
 * isn't persisted across reloads, which is fine for visual works on a card.
 */

const OPAQUE_ORIGIN_SHIM = `
<script>
(function(){
  function makeShim(){
    var s = Object.create(null);
    return {
      getItem: function(k){ return Object.prototype.hasOwnProperty.call(s,k) ? s[k] : null; },
      setItem: function(k,v){ s[k] = String(v); },
      removeItem: function(k){ delete s[k]; },
      clear: function(){ for (var k in s) delete s[k]; },
      key: function(i){ return Object.keys(s)[i] || null; },
      get length(){ return Object.keys(s).length; }
    };
  }
  try { window.localStorage.getItem('_'); }
  catch(e){
    try { Object.defineProperty(window,'localStorage',{value:makeShim(),configurable:true}); } catch(_){}
    try { Object.defineProperty(window,'sessionStorage',{value:makeShim(),configurable:true}); } catch(_){}
  }
  try { Object.defineProperty(document,'cookie',{value:'',writable:true,configurable:true}); } catch(_){}
})();
</script>
`;

function injectShim(html: string): string {
  if (html.startsWith("<!doctype") || html.startsWith("<!DOCTYPE") || html.includes("<html")) {
    return html.replace(/<head[^>]*>/i, (m) => m + OPAQUE_ORIGIN_SHIM);
  }
  return OPAQUE_ORIGIN_SHIM + html;
}

export default function HtmlRenderer({ html, interactive = false }: HtmlRendererProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const shimmedHtml = useMemo(() => injectShim(html), [html]);

  useEffect(() => {
    if (mounted) return;
    const el = wrapperRef.current;
    if (!el) return;

    if (typeof IntersectionObserver === "undefined") {
      setMounted(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setMounted(true);
            observer.disconnect();
            break;
          }
        }
      },
      { rootMargin: "300px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [mounted]);

  return (
    <div ref={wrapperRef} className="w-full h-full bg-[#0e0c0a] relative">
      {mounted ? (
        <iframe
          srcDoc={shimmedHtml}
          sandbox="allow-scripts"
          className="w-full h-full border-0"
          title="Work"
          style={{ background: "#0e0c0a" }}
        />
      ) : null}
      {!interactive ? (
        <div className="absolute bottom-2 right-2 flex items-center gap-1 opacity-40 pointer-events-none">
          <div className="w-1 h-2 bg-[#6a6560] rounded-full animate-pulse" />
          <div className="w-1 h-3 bg-[#6a6560] rounded-full animate-pulse" style={{ animationDelay: "0.2s" }} />
          <div className="w-1 h-2 bg-[#6a6560] rounded-full animate-pulse" style={{ animationDelay: "0.4s" }} />
        </div>
      ) : null}
    </div>
  );
}
