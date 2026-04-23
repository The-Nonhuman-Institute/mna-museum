"use client";

import { useState } from "react";

interface FAQ {
  q: string;
  a: string;
}

/**
 * Minimal expand/collapse list styled for the institutional palette.
 * First item can be opened by default via `defaultOpenIndex`.
 */
export default function FAQAccordion({
  items,
  defaultOpenIndex = -1,
}: {
  items: FAQ[];
  defaultOpenIndex?: number;
}) {
  const [openIdx, setOpenIdx] = useState<number>(defaultOpenIndex);

  return (
    <ul className="border-t border-ink/10">
      {items.map((item, i) => {
        const isOpen = openIdx === i;
        return (
          <li key={i} className="border-b border-ink/10">
            <button
              type="button"
              onClick={() => setOpenIdx(isOpen ? -1 : i)}
              aria-expanded={isOpen}
              className="w-full flex items-center justify-between gap-5 py-4 text-left group"
            >
              <span className="text-[13px] md:text-[14px] text-ink/85 group-hover:text-ink transition-colors">
                {item.q}
              </span>
              <span
                aria-hidden
                className={`text-[18px] leading-none text-ink/60 transition-transform shrink-0 ${
                  isOpen ? "rotate-45" : ""
                }`}
              >
                +
              </span>
            </button>
            {isOpen ? (
              <div className="pb-5 pr-8 text-[13px] leading-[1.65] text-ink/70">
                {item.a}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
