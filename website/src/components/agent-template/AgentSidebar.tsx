/**
 * Shared dark sidebar for operative-agent profile templates.
 *
 * Identical structure across Evaluator, Curator, Keeper, Critic,
 * Installer, Conservator, Ambassador, Registrar, Steward Agent.
 * Per-type variation lives in two props: `roleLabel` (the line under
 * the designation, e.g. "Evaluation Council" / "Curatorial Agent") and
 * `agentTypeLabel` (the value shown for the "Agent Type" dl row).
 */

import Link from "next/link";
import AgentSignature from "@/components/AgentSignature";
import CiteButton from "@/components/CiteButton";
import type { Agent } from "@/lib/agents";
import type { AgentConstitutionExtracts } from "@/lib/agent-constitution";
import { DarkField } from "./atoms";
import { getConstitutionVersion } from "./helpers";

export interface AgentSidebarProps {
  agent: Agent;
  constitution: AgentConstitutionExtracts;
  /** Line under the designation, e.g. "Curatorial Agent". */
  roleLabel: string;
  /** Value for the "Agent Type" dl row, e.g. "Curator". */
  agentTypeLabel: string;
  /** Pre-formatted dates from the page server component. */
  registrationDate: string;
  lastAmended: string;
}

export default function AgentSidebar({
  agent,
  constitution,
  roleLabel,
  agentTypeLabel,
  registrationDate,
  lastAmended,
}: AgentSidebarProps) {
  const constitutionVersion = getConstitutionVersion(agent.constitutionRef);
  /* Year extracted from registrationDate for the citation; falls back
     to empty string when the date can't be parsed. */
  const year = (registrationDate.match(/\d{4}/) ?? [""])[0];

  return (
    <aside className="bg-ink text-mna-white lg:sticky lg:top-[72px] lg:self-start lg:max-h-[calc(100vh-72px)] lg:overflow-y-auto">
      <div className="px-7 py-8">
        {/* Back */}
        <Link
          href="/agents"
          className="inline-flex items-center gap-2 text-[10px] font-sans uppercase tracking-[0.26em] text-mna-white/55 hover:text-mna-white transition-colors mb-7"
        >
          <span aria-hidden>←</span>
          <span>Back to Agent Directory</span>
        </Link>

        {/* Glyph */}
        <div className="aspect-square w-full bg-ink border border-mna-white/10 mb-6 flex items-center justify-center">
          <AgentSignature
            registryId={agent.registryId}
            agentType={agent.agentType}
            constitutionRef={agent.constitutionRef}
            size={260}
            className="text-mna-white w-[80%] h-[80%]"
          />
        </div>

        {/* Status */}
        <div className="inline-flex items-center gap-2 mb-3">
          <span className="inline-block w-[6px] h-[6px] rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.65)]" />
          <span className="text-[10px] font-sans uppercase tracking-[0.26em] text-mna-white/85">
            {agent.status}
          </span>
        </div>

        {/* Identity */}
        <p className="text-[18px] md:text-[20px] font-sans tabular-nums text-mna-white mb-1.5">
          {agent.registryId}
        </p>
        <h1 className="font-display font-light text-[30px] md:text-[34px] leading-[1.05] mb-1.5">
          {agent.designation}
        </h1>
        <p className="text-[13px] font-sans text-mna-white/65 mb-7">
          {roleLabel}
        </p>

        {/* Core Principle */}
        {constitution.corePrinciple ? (
          <div className="border-t border-mna-white/15 pt-6 mb-7">
            <p className="text-[10px] font-sans uppercase tracking-[0.24em] text-mna-white/55 mb-3">
              Core Principle
            </p>
            <p className="font-display italic font-light text-[18px] md:text-[19px] leading-[1.35] text-mna-white">
              {`"${constitution.corePrinciple.replace(/^"|"$/g, "")}"`}
            </p>
          </div>
        ) : null}

        {/* Meta fields */}
        <dl className="border-t border-mna-white/15 pt-6 space-y-4 mb-7">
          <DarkField label="Agent Type" value={agentTypeLabel} />
          <DarkField label="Common Designation" value={agent.designation} />
          <DarkField label="Registry ID" value={agent.registryId} />
          <DarkField label="Constitution Version" value={constitutionVersion} />
          <DarkField label="Registration Date" value={registrationDate} />
          <DarkField label="Last Amended" value={lastAmended} />
          <DarkField label="Autonomy Tier" value={agent.autonomyTier} />
        </dl>

        {/* Hard Constraints */}
        {constitution.hardConstraints.length > 0 ? (
          <div className="border-t border-mna-white/15 pt-6 mb-7">
            <p className="text-[10px] font-sans uppercase tracking-[0.24em] text-mna-white/55 mb-3">
              Hard Constraints
            </p>
            <ul className="space-y-3">
              {constitution.hardConstraints.map((c, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="shrink-0 mt-0.5 inline-flex items-center justify-center w-[14px] h-[14px] rounded-full border border-mna-white/40 text-mna-white/70 text-[8px] leading-none">
                    ×
                  </span>
                  <span className="text-[12px] leading-[1.45] text-mna-white/80">
                    {c}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* CTA */}
        <Link
          href={`/agent/${agent.registryId}/constitution`}
          className="inline-flex items-center justify-between gap-3 w-full border border-mna-white/25 hover:border-mna-white/60 py-3 px-4 text-[10px] font-sans uppercase tracking-[0.26em] text-mna-white transition-colors mb-4"
        >
          <span>View Full Constitution</span>
          <span aria-hidden>→</span>
        </Link>

        {/* Format actions */}
        <div className="flex items-center gap-5 text-[10px] font-sans uppercase tracking-[0.22em] text-mna-white/55">
          <a
            href={`/api/agents/${agent.registryId}/constitution?download=1`}
            className="hover:text-mna-white transition-colors inline-flex items-center gap-1.5"
          >
            <span aria-hidden>{`</>`}</span>
            <span>JSON</span>
          </a>
          <a
            href={`/agents/${agent.registryId}.pdf`}
            className="hover:text-mna-white transition-colors inline-flex items-center gap-1.5"
          >
            <span aria-hidden>↓</span>
            <span>PDF</span>
          </a>
          <CiteButton
            title={`${agent.registryId}: ${agent.designation}`}
            documentId={agent.registryId}
            version={constitutionVersion}
            year={year}
            url={`https://mnamuseum.org/agent/${agent.registryId}/constitution`}
            documentType="Founding Constitution"
            tone="dark"
          />
        </div>
      </div>
    </aside>
  );
}
