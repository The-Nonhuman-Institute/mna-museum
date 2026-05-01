"use client";

import { useEffect } from "react";
import WorkDisplay from "./WorkDisplay";
import type { Work } from "@/lib/collection";

/**
 * Focused image-expansion lightbox. Click "Expand" or the work
 * thumbnail in the provenance sidebar → fullscreen overlay with the
 * work shown large and a close button. Nothing else.
 *
 * Used to also pull in metadata + the full council evaluation record,
 * but the dedicated /work/[id]/provenance page already surfaces that;
 * the lightbox is just for *seeing the work bigger*.
 */
interface WorkLightboxProps {
  work: Work;
  /** Uncontrolled trigger: clicking opens the lightbox; the component
   *  manages its own open state. */
  children?: React.ReactNode;
  /** Optional controlled state. If `open` is provided, must pair with
   *  `onOpenChange`. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  triggerStyle?: "default" | "none";
}

export default function WorkLightbox({
  work,
  children,
  open: controlledOpen,
  onOpenChange,
  triggerStyle = "default",
}: WorkLightboxProps) {
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : false;
  const setOpen = (v: boolean) => {
    if (isControlled) onOpenChange?.(v);
  };

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const triggerClass =
    triggerStyle === "none"
      ? ""
      : "cursor-zoom-in transition-transform hover:scale-[1.02]";

  return (
    <>
      {children ? (
        <div onClick={() => setOpen(true)} className={triggerClass}>
          {children}
        </div>
      ) : null}

      {open && (
        <div
          className="fixed inset-0 z-[100] bg-[#0a0908]/95 flex items-center justify-center"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={`${work.title || work.id} expanded`}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
            className="fixed top-5 right-6 z-[110] text-[#d0ccc6] hover:text-white transition-colors text-3xl leading-none"
            aria-label="Close"
          >
            ×
          </button>

          {/* Inner stop-propagation wrapper so clicks on the work itself
              don't dismiss the overlay; only background clicks do. */}
          <div
            className="relative max-w-[90vw] max-h-[90vh] flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex-1 flex items-center justify-center w-full mb-6 min-h-0">
              <div className="w-[min(90vw,90vh)] h-[min(90vw,90vh)]">
                <WorkDisplay
                  work={work}
                  size="lightbox"
                  showPlacard={false}
                  framed={false}
                />
              </div>
            </div>

            {/* Minimal caption — id + italic title. No evaluation
                record, no metadata grid; the /provenance page is for
                that. */}
            <div className="text-center px-4">
              <p className="text-[11px] font-sans uppercase tracking-[0.22em] text-[#8a8680] mb-1.5">
                {work.id}
              </p>
              {work.title ? (
                <p className="font-display italic text-[18px] md:text-[22px] text-[#e8e4de] leading-tight">
                  {work.title}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
