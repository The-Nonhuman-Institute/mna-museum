/**
 * Press FilterRail — right-rail "Filter Press" panel.
 *
 * Mock #128: 4 dropdowns (type / format / agent / date range) + Apply
 * Filters button. Format and type are derived from the same field in
 * press.json — kept as separate dropdowns to mirror the mock; "Format"
 * is functionally identical to "Type" until press.json carries a
 * separate `format` field.
 */

"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { pressDocuments, pressTypeLabels } from "@/lib/press";
import InstitutionalSelect from "@/components/InstitutionalSelect";

type Option = { value: string; label: string };

const TYPE_OPTIONS: Option[] = [
  { value: "ALL", label: "All Types" },
  ...(Object.entries(pressTypeLabels) as [string, string][]).map(
    ([v, l]) => ({ value: v, label: l }),
  ),
];

const FORMAT_OPTIONS: Option[] = [
  { value: "ALL", label: "All Formats" },
  ...(Object.entries(pressTypeLabels) as [string, string][]).map(
    ([v, l]) => ({ value: v, label: l }),
  ),
];

const DATE_OPTIONS: Option[] = [
  { value: "ALL", label: "All Time" },
  { value: "30d", label: "Last 30 Days" },
  { value: "90d", label: "Last 90 Days" },
  { value: "1y", label: "Last Year" },
];

export default function PressFilterRail() {
  const sp = useSearchParams();
  const router = useRouter();

  const [type, setType] = useState(sp.get("type") ?? "ALL");
  const [format, setFormat] = useState(sp.get("format") ?? "ALL");
  const [agent, setAgent] = useState(sp.get("agent") ?? "ALL");
  const [date, setDate] = useState(sp.get("date") ?? "ALL");

  const agentOptions: Option[] = useMemo(() => {
    const seen = new Map<string, string>();
    for (const d of pressDocuments) {
      seen.set(d.conducted_by_id, d.conducted_by);
    }
    return [
      { value: "ALL", label: "All Agents" },
      ...Array.from(seen.entries()).map(([v, l]) => ({ value: v, label: l })),
    ];
  }, []);

  function apply() {
    const params = new URLSearchParams();
    if (type !== "ALL") params.set("type", type);
    if (format !== "ALL") params.set("format", format);
    if (agent !== "ALL") params.set("agent", agent);
    if (date !== "ALL") params.set("date", date);
    const qs = params.toString();
    router.replace(qs ? `/press?${qs}` : "/press", { scroll: false });
  }

  return (
    <div className="border border-mna-white/15 p-5">
      <div className="flex items-center gap-2 border-b border-mna-white/15 pb-3 mb-5">
        <h3 className="text-[10.5px] uppercase tracking-[0.26em] text-mna-white">
          Filter Press
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

      <Field label="By Type">
        <InstitutionalSelect
          value={type}
          onChange={setType}
          options={TYPE_OPTIONS}
          ariaLabel="Filter by type"
          tone="dark"
          size="compact"
        />
      </Field>
      <Field label="By Format">
        <InstitutionalSelect
          value={format}
          onChange={setFormat}
          options={FORMAT_OPTIONS}
          ariaLabel="Filter by format"
          tone="dark"
          size="compact"
        />
      </Field>
      <Field label="By Agent">
        <InstitutionalSelect
          value={agent}
          onChange={setAgent}
          options={agentOptions}
          ariaLabel="Filter by agent"
          tone="dark"
          size="compact"
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
