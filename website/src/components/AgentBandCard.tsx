/**
 * AgentBandCard — full-width agent card used on the Critics and
 * Evaluation Council pages. AgentSignature mark on the left, orientation
 * + tendencies on the right. Links to the agent's full constitution.
 */

import * as React from "react";
import Link from "next/link";
import type { Agent } from "@/lib/agents";
import AgentSignature from "@/components/AgentSignature";

export interface AgentBandCardProps {
  agent: Agent;
  /** Drives the label above the bullet list — Critic vs Evaluator. */
  kind: "critic" | "evaluator";
}

export default function AgentBandCard({ agent, kind }: AgentBandCardProps) {
  const tendencyLabel =
    kind === "critic" ? "Critical Tendencies" : "Evaluative Criteria";
  const orientation = agent.fullConstitution.orientation ?? "";
  const tendencies = agent.fullConstitution.tendencies ?? [];

  return (
    <Link
      href={`/agent/${agent.registryId}`}
      className="group block border border-mna-white/15 hover:border-mna-white/35 bg-mna-white/[0.015] hover:bg-mna-white/[0.04] transition-colors"
    >
      <div className="grid grid-cols-1 md:grid-cols-[140px_1fr] gap-5 md:gap-7 p-5 md:p-6">
        <div className="relative w-[140px] h-[140px] flex items-center justify-center bg-black border border-mna-white/15">
          <AgentSignature
            registryId={agent.registryId}
            agentType={agent.agentType}
            constitutionRef={agent.constitutionRef}
            size={120}
            className="text-mna-white/95 w-[88%] h-[88%]"
          />
          <span
            aria-hidden
            className={`absolute top-2 right-2 inline-block w-[6px] h-[6px] rounded-full ${
              agent.status === "ACTIVE"
                ? "bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.6)]"
                : "bg-mna-white/40"
            }`}
          />
        </div>

        <div className="min-w-0">
          <div className="flex items-center justify-between gap-3 mb-2">
            <p className="text-[10.5px] uppercase tracking-[0.06em] text-mna-white/55">
              {agent.registryId}
            </p>
            <span className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-mna-white/55">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  agent.status === "ACTIVE"
                    ? "bg-emerald-400"
                    : "bg-mna-white/40"
                }`}
              />
              {agent.status}
            </span>
          </div>
          <h3 className="font-serif text-[22px] leading-[1.2] text-mna-white group-hover:text-mna-white mb-3">
            {agent.designation}
          </h3>
          {orientation ? (
            <p className="text-[14px] leading-[1.6] text-mna-white/72 mb-4">
              {orientation}
            </p>
          ) : null}
          {tendencies.length > 0 ? (
            <div>
              <p className="text-[9.5px] uppercase tracking-[0.22em] text-mna-white/55 mb-2">
                {tendencyLabel}
              </p>
              <ul className="space-y-1.5">
                {tendencies.slice(0, 4).map((t, i) => (
                  <li
                    key={i}
                    className="flex gap-3 text-[13px] leading-[1.5] text-mna-white/72"
                  >
                    <span aria-hidden className="text-mna-white/35 shrink-0">
                      —
                    </span>
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="mt-5 inline-flex items-center gap-2 text-[10.5px] uppercase tracking-[0.22em] text-mna-white/55 group-hover:text-mna-white">
            View full constitution
            <span aria-hidden>→</span>
          </p>
        </div>
      </div>
    </Link>
  );
}
