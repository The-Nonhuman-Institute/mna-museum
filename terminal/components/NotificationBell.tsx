"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * NotificationBell — lives in the terminal header, available on every page.
 *
 * Shows a badge with the count of pending items requiring steward attention.
 * Tapping opens a dropdown overlay with actionable cards. NOT a new tab —
 * it's an overlay that appears from the header and dismisses on tap-outside
 * or navigation.
 *
 * Polls /api/notifications/count every 30 seconds to stay fresh without
 * requiring page navigation.
 */

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  action_url?: string;
}

export default function NotificationBell() {
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // Poll for notification count
  useEffect(() => {
    fetchCount();
    const interval = setInterval(fetchCount, 30000);
    return () => clearInterval(interval);
  }, []);

  async function fetchCount() {
    try {
      const res = await fetch("/api/notifications/count");
      if (res.ok) {
        const data = await res.json();
        setCount(data.total || 0);
        setItems(data.items || []);
      }
    } catch {
      // Silent fail — notification polling shouldn't break the UI
    }
  }

  function handleToggle() {
    if (!open) fetchCount(); // Refresh when opening
    setOpen(!open);
  }

  function handleItemTap(item: NotificationItem) {
    setOpen(false);
    if (item.action_url) {
      router.push(item.action_url);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={handleToggle}
        className="relative p-1 text-muted hover:text-foreground transition-colors"
        aria-label={`${count} notifications`}
      >
        {/* Bell icon — simple SVG */}
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {count > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-attention text-background text-[9px] font-mono flex items-center justify-center rounded-full">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {/* Dropdown overlay */}
      {open && (
        <>
          {/* Backdrop — tap to close */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full mt-2 w-80 max-h-[70vh] overflow-y-auto bg-background border border-border z-50 shadow-lg">
            <div className="px-4 py-3 border-b border-border">
              <p className="label">
                {count > 0
                  ? `${count} item${count === 1 ? "" : "s"} need${count === 1 ? "s" : ""} attention`
                  : "No pending items"}
              </p>
            </div>
            {items.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <p className="text-xs text-muted">All clear. The institution is running smoothly.</p>
              </div>
            ) : (
              <ul>
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      onClick={() => handleItemTap(item)}
                      className="w-full text-left px-4 py-3 border-b border-border last:border-b-0 hover:bg-surface transition-colors"
                    >
                      <p className="label mb-0.5">{item.type}</p>
                      <p className="text-sm text-foreground/90">{item.title}</p>
                      {item.subtitle && (
                        <p className="text-xs text-muted mt-0.5">{item.subtitle}</p>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
