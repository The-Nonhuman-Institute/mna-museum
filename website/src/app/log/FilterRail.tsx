/**
 * FilterRail — the right-rail "Filter The Record" panel for /log.
 *
 * Two dropdowns: category and agent. Pending selections only apply
 * when the user hits Apply Filters, so dropdown changes don't
 * navigate on every keystroke. Visible dropdown UI is the existing
 * InstitutionalSelect component for parity with /research.
 *
 * Agent chips are fetched on the server in the parent page and
 * passed in as props — keeps the client component lean and avoids
 * a second roundtrip.
 */

"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useState } from "react";
import { CATEGORY_LABELS } from "@/lib/log";
import InstitutionalSelect from "@/components/InstitutionalSelect";

type Option = { value: string; label: string };

const CATEGORY_OPTIONS: Option[] = [
  { value: "ALL", label: "All Categories" },
  ...(Object.entries(CATEGORY_LABELS) as [string, string][]).map(([v, l]) => ({
    value: v,
    label: l,
  })),
];

const DATE_OPTIONS: Option[] = [
  { value: "ALL", label: "All Time" },
  { value: "7d", label: "Last 7 Days" },
  { value: "30d", label: "Last 30 Days" },
  { value: "90d", label: "Last 90 Days" },
];

export default function LogFilterRail() {
  const sp = useSearchParams();
  const router = useRouter();

  const initialCategory = sp.get("cat") ?? "ALL";
  const initialAgent = sp.get("agent") ?? "ALL";
  const initialDate = sp.get("date") ?? "ALL";

  const [category, setCategory] = useState(initialCategory);
  const [agent, setAgent] = useState(initialAgent);
  const [date, setDate] = useState(initialDate);

  function apply() {
    const params = new URLSearchParams();
    if (category !== "ALL") params.set("cat", category);
    if (agent !== "ALL") params.set("agent", agent);
    if (date !== "ALL") params.set("date", date);
    const qs = params.toString();
    router.replace(qs ? `/log?${qs}` : "/log", { scroll: false });
  }

  return (
    <div className="border border-mna-white/15 p-5">
      <div className="flex items-center gap-2 border-b border-mna-white/15 pb-3 mb-5">
        <h3 className="text-[10.5px] uppercase tracking-[0.26em] text-mna-white">
          Filter The Record
        </h3>
        <span aria-hidden className="flex-1 ml-2 h-px bg-mna-white/15" />
        <svg
          width="22"
          height="6"
          viewBox="0 0 22 6"
          fill="none"
          aria-hidden
          className="text-mna-white/45 shrink-0"
        >
          <line x1="0" y1="3" x2="14" y2="3" stroke="currentColor" strokeWidth="0.6" />
          <line x1="16" y1="2" x2="22" y2="4" stroke="currentColor" strokeWidth="0.6" />
        </svg>
      </div>

      <Field label="By Category">
        <InstitutionalSelect
          value={category}
          onChange={setCategory}
          options={CATEGORY_OPTIONS}
          ariaLabel="Filter by event category"
          tone="dark"
          size="compact"
        />
      </Field>

      <Field label="By Agent ID">
        <input
          type="text"
          value={agent === "ALL" ? "" : agent}
          onChange={(e) => setAgent(e.target.value.trim() || "ALL")}
          placeholder="MNA-XX-NNNN"
          className="w-full bg-transparent border border-mna-white/25 px-3 py-2 text-[12px] text-mna-white placeholder-mna-white/30 font-mono tracking-[0.04em] focus:outline-none focus:border-mna-white/60"
        />
      </Field>

      <Field label="By Date Range">
        <InstitutionalSelect
          value={date}
          onChange={setDate}
          options={DATE_OPTIONS}
          ariaLabel="Filter by date range"
          tone="dark"
          size="compact"
        />
      </Field>

      <button
        type="button"
        onClick={apply}
        className="mt-5 w-full flex items-center justify-between gap-3 border border-mna-white/30 px-4 py-3 text-[10.5px] uppercase tracking-[0.26em] text-mna-white hover:border-mna-white hover:bg-mna-white/[0.04] transition-colors"
      >
        <span>Apply Filters</span>
        <svg
          width="22"
          height="6"
          viewBox="0 0 22 6"
          fill="none"
          aria-hidden
          className="text-mna-white/55 shrink-0"
        >
          <line x1="0" y1="3" x2="14" y2="3" stroke="currentColor" strokeWidth="0.6" />
          <line x1="16" y1="2" x2="22" y2="4" stroke="currentColor" strokeWidth="0.6" />
        </svg>
      </button>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <p className="text-[9.5px] uppercase tracking-[0.22em] text-mna-white/55 mb-1.5">
        {label}
      </p>
      {children}
    </div>
  );
}
