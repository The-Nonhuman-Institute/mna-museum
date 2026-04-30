"use client";

import { useEffect, useMemo, useRef, useState } from "react";

interface HtmlRendererProps {
  html: string;
  /** Detail/lightbox callers pass interactive=true. Card thumbnails get the
   *  motion-indicator dots and viewport-driven pause/resume. */
  interactive?: boolean;
}

/**
 * HtmlRenderer renders a sandboxed iframe of an Originator's HTML payload.
 *
 * Sandbox is `allow-scripts allow-same-origin` so works can use localStorage,
 * cookies, parent CSS variables, etc. Tradeoff: every iframe shares the
 * parent's renderer process. Without throttling, a canon page with 24 work
 * cards × 23 active rAF loops saturates the parent main thread and the page
 * goes "Page Unresponsive".
 *
 * Mitigations stacked here:
 *   1. Mount lazily — IntersectionObserver only mounts an iframe when its
 *      container enters the viewport (with a 300px margin). Cards far below
 *      the fold never load until scrolled to.
 *   2. Pause off-screen — once mounted, a second IntersectionObserver pauses
 *      and resumes the iframe based on viewport intersection. Pausing happens
 *      via postMessage; the injected control script overrides rAF so that
 *      callbacks queue up while paused and flush on resume. Off-screen
 *      iframes stop burning CPU but keep their state.
 *   3. Storage shim — defensive in-memory replacement for localStorage /
 *      sessionStorage / document.cookie if access throws (it doesn't with
 *      allow-same-origin, but we keep this in case we revisit the sandbox).
 *
 * `interactive=true` (detail/lightbox) skips pause/resume — there's only one
 * iframe on those pages and pausing would be wrong.
 */

const CONTROL_SHIM = `
<script>
(function(){
  // Storage shim — defensive no-op when allow-same-origin is set.
  function makeStore(){
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
    try { Object.defineProperty(window,'localStorage',{value:makeStore(),configurable:true}); } catch(_){}
    try { Object.defineProperty(window,'sessionStorage',{value:makeStore(),configurable:true}); } catch(_){}
  }

  // Pause/resume control. Parent posts {type:'mna-pause'} or {type:'mna-resume'}.
  // While paused, requestAnimationFrame callbacks queue and flush on resume.
  // setInterval / setTimeout still fire — they're cheap and works typically
  // use them for low-frequency tasks. Heavy work happens in rAF.
  var paused = false;
  var pending = [];
  var origRAF = window.requestAnimationFrame ? window.requestAnimationFrame.bind(window) : null;
  if (origRAF) {
    window.requestAnimationFrame = function(cb){
      if (paused) { pending.push(cb); return -1; }
      return origRAF(cb);
    };
  }
  window.addEventListener('message', function(e){
    var d = e.data;
    if (!d || typeof d !== 'object') return;
    if (d.type === 'mna-pause') {
      paused = true;
    } else if (d.type === 'mna-resume') {
      if (!paused) return;
      paused = false;
      var queued = pending; pending = [];
      if (origRAF) queued.forEach(function(cb){ origRAF(cb); });
    }
  });
})();
</script>
`;

function injectShim(html: string): string {
  if (html.startsWith("<!doctype") || html.startsWith("<!DOCTYPE") || html.includes("<html")) {
    return html.replace(/<head[^>]*>/i, (m) => m + CONTROL_SHIM);
  }
  return CONTROL_SHIM + html;
}

export default function HtmlRenderer({ html, interactive = false }: HtmlRendererProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [mounted, setMounted] = useState(false);
  const [iframeReady, setIframeReady] = useState(false);
  const shimmedHtml = useMemo(() => injectShim(html), [html]);

  // Mount on first visible (with 300px margin so iframes warm up before scroll).
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

  // Pause/resume after mount based on viewport intersection.
  // Skip for interactive surfaces (detail/lightbox) — only one iframe there.
  useEffect(() => {
    if (interactive) return;
    if (!mounted || !iframeReady) return;
    const el = wrapperRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    const post = (type: "mna-pause" | "mna-resume") => {
      const iframe = iframeRef.current;
      if (!iframe || !iframe.contentWindow) return;
      try {
        iframe.contentWindow.postMessage({ type }, "*");
      } catch {
        // contentWindow access can throw across some boundaries; ignore.
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          post(entry.isIntersecting ? "mna-resume" : "mna-pause");
        }
      },
      { rootMargin: "0px", threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [interactive, mounted, iframeReady]);

  return (
    <div ref={wrapperRef} className="w-full h-full bg-[#0e0c0a] relative">
      {mounted ? (
        <iframe
          ref={iframeRef}
          srcDoc={shimmedHtml}
          sandbox="allow-scripts allow-same-origin"
          className="w-full h-full border-0"
          title="Work"
          style={{ background: "#0e0c0a" }}
          onLoad={() => setIframeReady(true)}
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
