"use client";

import { useEffect, useMemo, useRef, useState } from "react";

interface HtmlRendererProps {
  html: string;
  /** Detail/lightbox callers pass interactive=true. On those surfaces the
   *  iframe is gated behind a click-to-play UI when previewUrl is given. */
  interactive?: boolean;
  /** URL of the curated preview PNG for this work. When set on an interactive
   *  surface, the iframe doesn't mount until the visitor clicks Play —
   *  protects detail pages from heavy-payload page-unresponsive hangs. */
  previewUrl?: string;
}

/**
 * HtmlRenderer renders a sandboxed iframe of an Originator's HTML payload.
 *
 * Sandbox is `allow-scripts allow-same-origin` so works can use localStorage,
 * cookies, parent CSS variables, etc. Tradeoff: every iframe shares the
 * parent's renderer process, so heavy works can saturate the parent thread.
 *
 * Two surfaces, two strategies:
 *   - interactive=false (rare now — gallery uses preview PNG via WorkDisplay):
 *     IntersectionObserver mounts iframe on first visible; pause/resume via
 *     postMessage when scrolled in/out of view.
 *   - interactive=true (detail/lightbox): if previewUrl is provided, render
 *     the preview image with a Play overlay. The visitor clicks to mount the
 *     iframe, opting into the heavy load. Without previewUrl, mount eagerly.
 *
 * Storage shim: defensive in-memory replacement for localStorage /
 * sessionStorage / document.cookie if access throws (no-op when
 * allow-same-origin is set, kept for future sandbox changes).
 */

const CONTROL_SHIM = `
<script>
(function(){
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

export default function HtmlRenderer({ html, interactive = false, previewUrl }: HtmlRendererProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const useClickGate = interactive && Boolean(previewUrl);
  const [activated, setActivated] = useState(!useClickGate);
  const [iframeReady, setIframeReady] = useState(false);
  const shimmedHtml = useMemo(() => injectShim(html), [html]);

  // For non-interactive surfaces, mount on first visible (300px margin).
  // For interactive without click gate, mount immediately.
  useEffect(() => {
    if (activated) return;
    if (interactive) return; // click gate already handled via state
    const el = wrapperRef.current;
    if (!el) return;

    if (typeof IntersectionObserver === "undefined") {
      setActivated(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActivated(true);
            observer.disconnect();
            break;
          }
        }
      },
      { rootMargin: "300px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [activated, interactive]);

  // Pause/resume after mount based on viewport intersection (non-interactive only).
  useEffect(() => {
    if (interactive) return;
    if (!activated || !iframeReady) return;
    const el = wrapperRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    const post = (type: "mna-pause" | "mna-resume") => {
      const iframe = iframeRef.current;
      if (!iframe || !iframe.contentWindow) return;
      try {
        iframe.contentWindow.postMessage({ type }, "*");
      } catch {
        // contentWindow access can throw across boundaries; ignore.
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
  }, [interactive, activated, iframeReady]);

  return (
    <div ref={wrapperRef} className="w-full h-full bg-[#0e0c0a] relative">
      {/* Preview image — sits behind the iframe (and above when click-gated).
          On interactive surfaces with a click gate, this is the visitor's
          first impression of the work. */}
      {previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewUrl}
          alt=""
          aria-hidden
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : null}

      {activated ? (
        <iframe
          ref={iframeRef}
          srcDoc={shimmedHtml}
          sandbox="allow-scripts allow-same-origin"
          className="absolute inset-0 w-full h-full border-0"
          title="Work"
          style={{ background: "transparent" }}
          onLoad={() => setIframeReady(true)}
        />
      ) : null}

      {/* Click-to-play gate. Click anywhere on the surface to mount the iframe. */}
      {useClickGate && !activated ? (
        <button
          type="button"
          onClick={() => setActivated(true)}
          className="absolute inset-0 w-full h-full flex items-center justify-center group focus:outline-none"
          aria-label="Play live work"
        >
          <span className="absolute inset-0 bg-black/30 group-hover:bg-black/20 transition-colors" />
          <span className="relative flex flex-col items-center gap-3 text-white">
            <span className="w-16 h-16 rounded-full border border-white/60 flex items-center justify-center group-hover:border-white transition-colors">
              <svg width="20" height="22" viewBox="0 0 20 22" fill="currentColor" aria-hidden>
                <path d="M2 1 L18 11 L2 21 Z" />
              </svg>
            </span>
            <span className="text-[10px] font-sans uppercase tracking-[0.22em]">
              Play Live Work
            </span>
          </span>
        </button>
      ) : null}

      {!interactive ? (
        <div className="absolute bottom-2 right-2 flex items-center gap-1 opacity-40 pointer-events-none z-10">
          <div className="w-1 h-2 bg-[#6a6560] rounded-full animate-pulse" />
          <div className="w-1 h-3 bg-[#6a6560] rounded-full animate-pulse" style={{ animationDelay: "0.2s" }} />
          <div className="w-1 h-2 bg-[#6a6560] rounded-full animate-pulse" style={{ animationDelay: "0.4s" }} />
        </div>
      ) : null}
    </div>
  );
}
