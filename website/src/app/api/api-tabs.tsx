"use client";

/**
 * ApiTabs — section-anchor tabs for /api with scroll-spy.
 *
 * Each tab is a real anchor link to a section id. As the reader
 * scrolls, the IntersectionObserver flips the active tab to whichever
 * section is most prominently in view, so the visual highlight stays
 * accurate without requiring a click.
 */

import * as React from "react";

export interface ApiTabsItem {
  id: string;
  label: string;
}

export default function ApiTabs({
  tabs,
  defaultActive,
}: {
  tabs: ApiTabsItem[];
  defaultActive: string;
}) {
  const [active, setActive] = React.useState(defaultActive);

  React.useEffect(() => {
    const elements = tabs
      .map((t) => document.getElementById(t.id))
      .filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0) return;

    /* Track the topmost section whose top edge is above 30% of the
       viewport — that's "currently being read." */
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .map((e) => e.target as HTMLElement);
        if (visible.length === 0) return;
        visible.sort(
          (a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top,
        );
        setActive(visible[0].id);
      },
      {
        /* Section becomes "active" once its top reaches the upper third
           of the viewport, and stays active until it scrolls past the
           bottom third. */
        rootMargin: "-30% 0px -60% 0px",
        threshold: 0,
      },
    );

    for (const el of elements) observer.observe(el);
    return () => observer.disconnect();
  }, [tabs]);

  /* On click, smooth-scroll and update active immediately so the
     highlight doesn't lag behind the reader. */
  function onTabClick(e: React.MouseEvent<HTMLAnchorElement>, id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    setActive(id);
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    history.replaceState(null, "", `#${id}`);
  }

  return (
    <div className="border-b border-mna-white/15">
      <nav className="flex flex-wrap gap-x-9 py-2">
        {tabs.map((t) => {
          const isActive = t.id === active;
          return (
            <a
              key={t.id}
              href={`#${t.id}`}
              onClick={(e) => onTabClick(e, t.id)}
              className={`relative text-[10.5px] uppercase tracking-[0.22em] py-2.5 transition-colors ${
                isActive
                  ? "text-mna-white"
                  : "text-mna-white/55 hover:text-mna-white/85"
              }`}
            >
              {t.label.toUpperCase()}
              {isActive ? (
                <span className="absolute -bottom-px left-0 right-0 h-px bg-mna-white" />
              ) : null}
            </a>
          );
        })}
      </nav>
    </div>
  );
}
