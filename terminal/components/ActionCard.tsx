"use client";

import { useState } from "react";

/**
 * ActionCard — a Feed card with embedded action buttons.
 *
 * Renders an institutional event that requires steward action, with
 * one or two tappable buttons that call an API endpoint directly.
 * No Keeper required. Tap → confirm → done.
 *
 * After an action is taken, the card shows the result inline and
 * disables the buttons to prevent double-tapping.
 */

interface Action {
  label: string;
  endpoint: string;
  body: Record<string, unknown>;
  variant: "primary" | "danger" | "secondary";
}

export default function ActionCard({
  title,
  subtitle,
  details,
  actions,
  borderColor = "attention",
}: {
  title: string;
  subtitle?: string;
  details?: { label: string; value: string }[];
  actions: Action[];
  borderColor?: "attention" | "active" | "error";
}) {
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAction(action: Action) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(action.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action.body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setResult(data.message || data.status || "Done");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  const borderClass =
    borderColor === "active"
      ? "border-l-active"
      : borderColor === "error"
        ? "border-l-error"
        : "border-l-attention";

  return (
    <div className={`border border-border border-l-2 ${borderClass} p-4 mb-3`}>
      <p className="label mb-1">{title}</p>
      {subtitle && (
        <p className="text-sm text-foreground/90 mb-2">{subtitle}</p>
      )}
      {details && details.length > 0 && (
        <div className="mb-3">
          {details.map((d) => (
            <div
              key={d.label}
              className="flex justify-between py-1 border-b border-border last:border-b-0"
            >
              <span className="label">{d.label}</span>
              <span className="data text-xs">{d.value}</span>
            </div>
          ))}
        </div>
      )}

      {result ? (
        <p className="text-sm text-active mt-2">{result}</p>
      ) : error ? (
        <p className="text-sm text-error mt-2 break-all" style={{ overflowWrap: "anywhere" }}>{error}</p>
      ) : (
        <div className="flex gap-2 mt-3">
          {actions.map((action) => (
            <button
              key={action.label}
              onClick={() => handleAction(action)}
              disabled={loading}
              className={`label px-4 py-2 transition-colors disabled:opacity-30 ${
                action.variant === "primary"
                  ? "bg-foreground text-background hover:bg-foreground/80"
                  : action.variant === "danger"
                    ? "bg-error/20 text-error border border-error/50 hover:bg-error/30"
                    : "border border-border text-muted hover:text-foreground hover:border-foreground/40"
              }`}
            >
              {loading ? "..." : action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
