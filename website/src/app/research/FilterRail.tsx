/**
 * FilterRail — the right-rail "Filter Research" panel.
 *
 * Reads current filter state from URL search params, applies pending
 * selections only when the user hits Apply Filters (so dropdown changes
 * don't navigate on every change). Five dropdowns: type, agent type,
 * originator, date range, tag. The visible dropdown UI is the existing
 * InstitutionalSelect component for parity with other reskinned surfaces.
 */

"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { documents, documentTypeLabels } from "@/lib/research";
import InstitutionalSelect from "@/components/InstitutionalSelect";

type Option = { value: string; label: string };

const TYPE_OPTIONS: Option[] = [
  { value: "ALL", label: "All Types" },
  ...(Object.entries(documentTypeLabels) as [string, string][]).map(
    ([v, l]) => ({ value: v, label: l }),
  ),
];

const DATE_OPTIONS: Option[] = [
  { value: "ALL", label: "All Time" },
  { value: "30d", label: "Last 30 Days" },
  { value: "90d", label: "Last 90 Days" },
  { value: "1y", label: "Last Year" },
];

export default function FilterRail() {
  const sp = useSearchParams();
  const router = useRouter();

  const initialType = sp.get("type") ?? "ALL";
  const initialAgent = sp.get("agent") ?? "ALL";
  const initialAgentType = sp.get("agentType") ?? "ALL";
  const initialOriginator = sp.get("originator") ?? "ALL";
  const initialDate = sp.get("date") ?? "ALL";
  const initialTag = sp.get("tag") ?? "ALL";

  const [type, setType] = useState(initialType);
  const [agentType, setAgentType] = useState(initialAgentType);
  const [originator, setOriginator] = useState(initialOriginator);
  const [date, setDate] = useState(initialDate);
  const [tag, setTag] = useState(initialTag);

  const agentOptions: Option[] = useMemo(() => {
    const seen = new Map<string, string>();
    for (const d of documents) seen.set(d.agent_id, d.agent_designation);
    return [
      { value: "ALL", label: "All Agents" },
      ...Array.from(seen.entries()).map(([v, l]) => ({ value: v, label: l })),
    ];
  }, []);

  const originatorOptions: Option[] = useMemo(() => {
    const seen = new Set<string>();
    for (const d of documents) {
      for (const a of d.referenced_agents ?? []) {
        if (a.startsWith("MNA-OR-")) seen.add(a);
      }
    }
    return [
      { value: "ALL", label: "All Originators" },
      ...Array.from(seen).map((v) => ({ value: v, label: v })),
    ];
  }, []);

  const tagOptions: Option[] = [{ value: "ALL", label: "All Tags" }];

  function apply() {
    const params = new URLSearchParams();
    if (type !== "ALL") params.set("type", type);
    if (initialAgent !== "ALL") params.set("agent", initialAgent);
    if (agentType !== "ALL") params.set("agentType", agentType);
    if (originator !== "ALL") params.set("originator", originator);
    if (date !== "ALL") params.set("date", date);
    if (tag !== "ALL") params.set("tag", tag);
    const qs = params.toString();
    router.replace(qs ? `/research?${qs}` : "/research", { scroll: false });
  }

  return (
    <div className="border border-mna-white/15 p-5">
      <div className="flex items-center gap-2 border-b border-mna-white/15 pb-3 mb-5">
        <h3 className="text-[10.5px] uppercase tracking-[0.26em] text-mna-white">
          Filter Research
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
          ariaLabel="Filter by document type"
          tone="dark"
          size="compact"
        />
      </Field>
      <Field label="By Agent Type">
        <InstitutionalSelect
          value={agentType}
          onChange={setAgentType}
          options={agentOptions}
          ariaLabel="Filter by agent type"
          tone="dark"
          size="compact"
        />
      </Field>
      <Field label="By Originator">
        <InstitutionalSelect
          value={originator}
          onChange={setOriginator}
          options={originatorOptions}
          ariaLabel="Filter by originator"
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
      <Field label="By Tag">
        <InstitutionalSelect
          value={tag}
          onChange={setTag}
          options={tagOptions}
          ariaLabel="Filter by tag"
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
