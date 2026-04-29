"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export interface SelectOption {
  value: string;
  label: string;
}

interface InstitutionalSelectProps {
  label?: string;
  value: string;
  options: SelectOption[];
  onChange?: (v: string) => void;
  /** Width of the control. Defaults to "w-full". */
  widthClass?: string;
  /** Tone: "light" for warm-paper/bone pages, "dark" for ink pages. */
  tone?: "light" | "dark";
  /** Compact: smaller text + tighter padding (matches agent-page sort). */
  size?: "default" | "compact";
  /** Optional override for aria-label when no visible label is given. */
  ariaLabel?: string;
}

/**
 * Styled, accessible dropdown that replaces native <select> so the listbox
 * matches the institutional chrome (warm-paper/ink palette, Inter, tracked
 * uppercase eyebrow) instead of falling back to the OS UI. Implements the
 * combobox + listbox ARIA pattern with keyboard navigation and outside-click
 * dismissal.
 */
export default function InstitutionalSelect({
  label,
  value,
  options,
  onChange,
  widthClass = "w-full",
  tone = "light",
  size = "default",
  ariaLabel,
}: InstitutionalSelectProps) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLUListElement>(null);
  const listboxId = useId();

  const selected = useMemo(
    () => options.find((o) => o.value === value) ?? options[0],
    [options, value]
  );

  // Keep activeIdx in sync with current value when the popover opens.
  useEffect(() => {
    if (open) {
      const idx = options.findIndex((o) => o.value === value);
      setActiveIdx(idx >= 0 ? idx : 0);
    }
  }, [open, options, value]);

  // Scroll the active item into view as the user navigates.
  useLayoutEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const el = panel.querySelector<HTMLLIElement>(
      `[data-idx="${activeIdx}"]`
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIdx, open]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      if (buttonRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const commit = useCallback(
    (v: string) => {
      onChange?.(v);
      setOpen(false);
      buttonRef.current?.focus();
    },
    [onChange]
  );

  const handleButtonKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen(true);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const handleListKey = (e: React.KeyboardEvent<HTMLUListElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(options.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIdx(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActiveIdx(options.length - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      commit(options[activeIdx]!.value);
    } else if (e.key === "Escape" || e.key === "Tab") {
      setOpen(false);
      buttonRef.current?.focus();
    }
  };

  // Tone classes — hardcoded so they survive mode-dark token flips in the
  // canon/archive shells, where the page uses dark CSS variables but the
  // filter bar still sits on a light surface.
  const isDark = tone === "dark";
  const btnBase = isDark
    ? "bg-ink text-mna-white border-mna-white/30 hover:border-mna-white/60"
    : "bg-bone text-ink border-ink/20 hover:border-ink/40";
  const panelBase = isDark
    ? "bg-ink text-mna-white border-mna-white/20"
    : "bg-mna-white text-ink border-ink/20";
  const chevronColor = isDark ? "text-mna-white/60" : "text-ink/50";
  const itemHover = isDark ? "hover:bg-mna-white/5" : "hover:bg-warm-paper";
  const itemActive = isDark ? "bg-mna-white/10" : "bg-warm-paper/80";
  const itemMuted = isDark ? "text-mna-white/45" : "text-ink/45";
  const dividerColor = isDark ? "border-mna-white/10" : "border-ink/5";

  const padding =
    size === "compact" ? "pl-3 pr-8 py-2" : "pl-3.5 pr-9 py-2.5";
  const textSize = size === "compact" ? "text-[11px]" : "text-[13px]";

  return (
    <div className={`flex flex-col ${widthClass === "w-full" ? "" : widthClass}`}>
      {label ? (
        <span className="text-[10px] font-sans uppercase tracking-[0.22em] text-ink/55 mb-1.5">
          {label}
        </span>
      ) : null}
      <div className={`relative ${widthClass}`}>
        <button
          ref={buttonRef}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-label={ariaLabel ?? label}
          onClick={() => setOpen((v) => !v)}
          onKeyDown={handleButtonKey}
          className={`w-full text-left ${textSize} font-sans ${btnBase} border ${padding} cursor-pointer transition-colors focus:outline-none focus-visible:outline-none focus-visible:ring-0`}
        >
          <span className="block truncate">{selected?.label ?? ""}</span>
          <span
            aria-hidden
            className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 ${chevronColor} text-[9px] transition-transform ${
              open ? "rotate-180" : ""
            }`}
          >
            ▾
          </span>
        </button>

        {open ? (
          <ul
            ref={panelRef}
            id={listboxId}
            role="listbox"
            tabIndex={-1}
            onKeyDown={handleListKey}
            aria-activedescendant={`${listboxId}-opt-${activeIdx}`}
            className={`absolute left-0 right-0 top-full mt-1 z-50 ${panelBase} border max-h-[280px] overflow-y-auto focus:outline-none shadow-[0_8px_24px_-12px_rgba(10,10,10,0.35)]`}
            autoFocus
          >
            {options.map((o, i) => {
              const isSelected = o.value === value;
              const isActive = i === activeIdx;
              return (
                <li
                  key={o.value}
                  id={`${listboxId}-opt-${i}`}
                  data-idx={i}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActiveIdx(i)}
                  onClick={() => commit(o.value)}
                  className={`relative ${textSize} font-sans ${padding} cursor-pointer border-b last:border-b-0 ${dividerColor} ${itemHover} ${
                    isActive ? itemActive : ""
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className={`inline-block w-[5px] h-[5px] rounded-full ${
                        isSelected
                          ? isDark
                            ? "bg-mna-white"
                            : "bg-ink"
                          : "bg-transparent"
                      }`}
                    />
                    <span
                      className={`truncate ${
                        isSelected ? "" : itemMuted
                      }`}
                    >
                      {o.label}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
