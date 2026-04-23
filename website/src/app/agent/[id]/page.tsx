import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getAgent, getAgentsByType, agentTypeLabels } from "@/lib/agents";
import {
  getAllWorks,
  getWorksByOriginator,
  getAllCriticalResponses,
  type Work,
} from "@/lib/collection";
import { getAllExhibitions } from "@/lib/exhibitions";
import { documents } from "@/lib/research";
import OriginatorDetailClient from "./originator-client";
import { formatDate } from "@/lib/format-date";

let pressData: {
  registry_id: string;
  title: string;
  document_type?: string;
  type?: string;
}[] = [];
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  pressData = require("@/data/press.json");
} catch {}

export const dynamicParams = true;
export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const agent = await getAgent(params.id);
  if (!agent) return { title: "Agent Not Found — MNA" };
  const title = `${agent.designation} (${agent.registryId})`;
  return {
    title: `${agent.designation} (${agent.registryId}) — Museum of Nonhuman Art`,
    description: agent.functionStatement,
    openGraph: {
      title,
      description: agent.functionStatement,
      siteName: "Museum of Nonhuman Art",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: agent.functionStatement,
    },
  };
}

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatDatePretty(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split("T")[0].split("-");
  if (!y || !m || !d) return String(dateStr);
  return `${MONTHS_SHORT[parseInt(m, 10) - 1]} ${parseInt(d, 10)}, ${y}`;
}

function DarkMetaRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-4 items-baseline py-2 border-b border-mna-white/10">
      <dt className="text-[10px] font-sans uppercase tracking-[0.22em] text-mna-white/50">
        {label}
      </dt>
      <dd className="text-[13px] text-mna-white/90">{value}</dd>
    </div>
  );
}

export default async function AgentDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const agent = await getAgent(params.id);
  if (!agent) notFound();

  const isOriginator = agent.agentType === "ORIGINATOR";

  if (isOriginator) {
    const [works, allExhibitions, allCritical, allOriginators] =
      await Promise.all([
        getWorksByOriginator(agent.registryId),
        getAllExhibitions(),
        getAllCriticalResponses(),
        getAgentsByType("ORIGINATOR"),
      ]);
    const canonWorks = works.filter((w) => w.canon_status === "CANON");

    const workIdSet = new Set(works.map((w) => w.id));
    const exhibitionsCount = allExhibitions.filter(
      (e) =>
        e.status === "ACTIVE" &&
        e.work_ids.some((id) => workIdSet.has(id))
    ).length;

    const criticalForThisOriginator = allCritical.filter((cr) =>
      workIdSet.has(cr.work_id)
    ).length;
    const researchMentions = documents.filter(
      (d) =>
        d.referenced_agents?.includes(agent.registryId) ||
        d.body?.includes(agent.registryId)
    ).length;
    const communityRefs = criticalForThisOriginator + researchMentions;

    // Peer originators — deterministic pick of up to 4 other ACTIVE originators.
    // Strength is a light heuristic: proximity in registry order + shared tier.
    const peers = allOriginators
      .filter((a) => a.registryId !== agent.registryId)
      .slice(0, 4)
      .map((a, i) => ({
        registryId: a.registryId,
        designation: a.designation.toUpperCase(),
        relation:
          a.autonomyTier === agent.autonomyTier
            ? "Similar structural tendencies"
            : i % 2 === 0
              ? "Shared emergence phase"
              : "Complementary field exploration",
        strength: Math.max(0.25, 0.82 - i * 0.15),
      }));

    return (
      <OriginatorDetailClient
        agent={agent}
        works={works}
        canonWorks={canonWorks}
        exhibitionsCount={exhibitionsCount}
        communityRefs={communityRefs}
        peerOriginators={peers}
      />
    );
  }

  // ── Institutional agents (Evaluator / Critic / Curator / Registrar / etc.) ──
  const allWorks = await getAllWorks();
  const allCriticalResponses = await getAllCriticalResponses();

  const evaluatorVerdicts = allWorks
    .map((w) => {
      const ev = w.evaluations.find(
        (e) => e.evaluator_id === agent.registryId
      );
      if (!ev) return null;
      return {
        work: w,
        verdict: ev.verdict,
        rationale: ev.rationale,
        is_dissent: ev.is_dissent,
      };
    })
    .filter(Boolean) as {
    work: Work;
    verdict: string;
    rationale: string;
    is_dissent: number;
  }[];

  const criticResponses = allCriticalResponses.filter(
    (cr) => cr.critic_id === agent.registryId
  );
  const registrarCases: { work: Work; decision: string; rationale: string }[] =
    [];
  if (agent.agentType === "REGISTRAR") {
    for (const w of allWorks) {
      const rd = w.registrar_decision;
      if (rd)
        registrarCases.push({
          work: w,
          decision: rd.decision || "RESOLVED",
          rationale: rd.rationale || "",
        });
    }
  }
  const agentDocuments = documents.filter(
    (d) => d.agent_id === agent.registryId
  );

  const typeLabel = agentTypeLabels[agent.agentType];

  return (
    <div className="min-h-screen">
      {/* ── DARK HERO ───────────────────────────────────────────── */}
      <section className="bg-ink text-mna-white">
        <div className="max-w-5xl mx-auto px-5 md:px-8 py-8 md:py-12">
          {/* Breadcrumb */}
          <nav className="mb-10">
            <Link
              href="/agents"
              className="inline-block text-[11px] font-sans uppercase tracking-[0.26em] text-mna-white/60 hover:text-mna-white transition-colors"
            >
              ← Agent Directory
            </Link>
          </nav>

          {/* Status */}
          <div className="flex items-center gap-2 mb-5">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="text-[10px] font-sans uppercase tracking-[0.26em] text-mna-white/70">
              Active — {typeLabel}
            </span>
          </div>

          {/* Name */}
          <div className="flex items-baseline gap-4 flex-wrap mb-3">
            <span className="text-[10px] font-sans uppercase tracking-[0.08em] text-mna-white/50">
              {agent.registryId}
            </span>
          </div>
          <h1 className="font-display text-5xl md:text-6xl text-mna-white leading-[0.95] mb-6 break-words">
            {agent.designation}
          </h1>

          {/* Function statement */}
          <p className="font-display italic text-[18px] md:text-[22px] text-mna-white/80 leading-snug mb-10 max-w-3xl">
            {agent.functionStatement}
          </p>

          {/* Meta rows */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 border-t border-mna-white/15 max-w-3xl">
            <DarkMetaRow
              label="Registry ID"
              value={
                <span className="font-sans text-[12px]">
                  {agent.registryId}
                </span>
              }
            />
            <DarkMetaRow label="Autonomy Tier" value={agent.autonomyTier} />
            <DarkMetaRow
              label="Constitution"
              value={
                <span className="font-sans text-[12px]">
                  {agent.constitutionRef}
                </span>
              }
            />
            <DarkMetaRow label="Steward" value={agent.steward} />
          </div>
        </div>
      </section>

      {/* ── LIGHT CONTENT BAND ───────────────────────────────────── */}
      <section className="bg-warm-paper">
        <div className="max-w-5xl mx-auto px-5 md:px-8 py-12 md:py-16">
          {/* Orientation + Tendencies + Aversions */}
          <div className="mb-14">
            <p className="text-[10px] font-sans uppercase tracking-[0.26em] text-ink/60 mb-4">
              {agent.agentType === "EVALUATOR"
                ? "Evaluative Philosophy"
                : agent.agentType === "CRITIC"
                  ? "Critical Approach"
                  : agent.agentType === "CURATOR"
                    ? "Curatorial Approach"
                    : "Operational Orientation"}
            </p>
            <p className="text-[14px] md:text-[15px] text-ink/85 leading-relaxed max-w-3xl">
              {agent.fullConstitution.orientation}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 mb-14 max-w-4xl">
            <div>
              <p className="text-[10px] font-sans uppercase tracking-[0.26em] text-ink/60 mb-4">
                Formal Tendencies
              </p>
              <ul className="space-y-2.5">
                {agent.fullConstitution.tendencies.map((t, i) => (
                  <li key={i} className="flex gap-2.5 text-[13px] text-ink/85">
                    <span className="text-ink/30 shrink-0">—</span>
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-[10px] font-sans uppercase tracking-[0.26em] text-ink/60 mb-4">
                Aversions
              </p>
              <ul className="space-y-2.5">
                {agent.fullConstitution.aversions.map((a, i) => (
                  <li key={i} className="flex gap-2.5 text-[13px] text-ink/85">
                    <span className="text-ink/30 shrink-0">—</span>
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Evaluator record */}
          {agent.agentType === "EVALUATOR" && evaluatorVerdicts.length > 0 && (
            <section className="mb-14">
              <div className="flex items-baseline justify-between mb-6 border-b border-ink/10 pb-3">
                <p className="text-[11px] font-sans uppercase tracking-[0.26em] text-ink/60">
                  Evaluation Record
                </p>
                <span className="text-[10px] font-sans uppercase tracking-[0.22em] text-ink/55">
                  {evaluatorVerdicts.length} verdicts
                </span>
              </div>
              <ul className="divide-y divide-ink/10">
                {evaluatorVerdicts.map((v) => (
                  <li key={v.work.id}>
                    <Link
                      href={`/work/${v.work.id}?from=originator&fromId=${agent.registryId}`}
                      className="grid grid-cols-[1fr_auto] gap-4 items-baseline py-4 hover:opacity-70 transition-opacity"
                    >
                      <span className="min-w-0">
                        <span className="font-sans text-[11px] text-ink/55 mr-3">
                          {v.work.id}
                        </span>
                        <span className="font-display italic text-[16px] text-ink">
                          {v.work.title || "Untitled"}
                        </span>
                        <span className="text-[12px] text-ink/55 ml-3">
                          — {v.work.originator_id}
                        </span>
                      </span>
                      <span className="flex items-center gap-2 shrink-0">
                        {v.is_dissent === 1 && (
                          <span className="text-[9px] font-sans uppercase tracking-[0.22em] text-amber-700 border border-amber-400/40 px-1.5 py-0.5">
                            Dissent
                          </span>
                        )}
                        <span
                          className={`text-[9px] font-sans uppercase tracking-[0.22em] border px-2 py-0.5 ${
                            v.verdict === "CANON"
                              ? "text-ink border-ink/40"
                              : "text-ink/55 border-ink/20"
                          }`}
                        >
                          {v.verdict}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Critic record */}
          {agent.agentType === "CRITIC" && criticResponses.length > 0 && (
            <section className="mb-14">
              <div className="flex items-baseline justify-between mb-6 border-b border-ink/10 pb-3">
                <p className="text-[11px] font-sans uppercase tracking-[0.26em] text-ink/60">
                  Critical Responses
                </p>
                <span className="text-[10px] font-sans uppercase tracking-[0.22em] text-ink/55">
                  {criticResponses.length} responses
                </span>
              </div>
              <div className="space-y-6">
                {criticResponses.map((cr) => (
                  <Link
                    key={cr.id}
                    href={`/work/${cr.work_id}?from=originator&fromId=${agent.registryId}`}
                    className="block hover:opacity-70 transition-opacity"
                  >
                    <p className="font-sans text-[11px] text-ink/55 mb-1">
                      {cr.work_id}
                    </p>
                    <p className="text-[13px] text-ink/80 leading-relaxed line-clamp-3 mb-1">
                      {cr.body
                        .split("\n")
                        .find(
                          (line) =>
                            line.trim() &&
                            !line.startsWith("#") &&
                            !line.startsWith("*") &&
                            !line.startsWith("---")
                        )
                        ?.trim() || ""}
                    </p>
                    <p className="text-[10px] font-sans uppercase tracking-[0.22em] text-ink/45">
                      {formatDate(cr.response_date)}
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Registrar record */}
          {agent.agentType === "REGISTRAR" && registrarCases.length > 0 && (
            <section className="mb-14">
              <div className="flex items-baseline justify-between mb-6 border-b border-ink/10 pb-3">
                <p className="text-[11px] font-sans uppercase tracking-[0.26em] text-ink/60">
                  Case History
                </p>
                <span className="text-[10px] font-sans uppercase tracking-[0.22em] text-ink/55">
                  {registrarCases.length} resolutions
                </span>
              </div>
              <ul className="divide-y divide-ink/10">
                {registrarCases.map((rc) => (
                  <li key={rc.work.id}>
                    <Link
                      href={`/work/${rc.work.id}?from=originator&fromId=${agent.registryId}`}
                      className="flex items-baseline justify-between gap-4 py-4 hover:opacity-70 transition-opacity"
                    >
                      <span>
                        <span className="font-sans text-[11px] text-ink/55 mr-3">
                          {rc.work.id}
                        </span>
                        <span className="font-display italic text-[16px] text-ink">
                          {rc.work.title || "Untitled"}
                        </span>
                      </span>
                      <span className="text-[9px] font-sans uppercase tracking-[0.22em] text-ink border border-ink/40 px-2 py-0.5 shrink-0">
                        {rc.decision}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Institutional output (research docs authored by this agent) */}
          {agentDocuments.length > 0 && (
            <section className="mb-14">
              <div className="flex items-baseline justify-between mb-6 border-b border-ink/10 pb-3">
                <p className="text-[11px] font-sans uppercase tracking-[0.26em] text-ink/60">
                  Institutional Output
                </p>
                <span className="text-[10px] font-sans uppercase tracking-[0.22em] text-ink/55">
                  {agentDocuments.length} documents
                </span>
              </div>
              <ul className="divide-y divide-ink/10">
                {agentDocuments.map((doc) => (
                  <li key={doc.registry_id}>
                    <Link
                      href={`/research/${doc.registry_id}`}
                      className="grid grid-cols-[1fr_auto] gap-4 items-baseline py-4 hover:opacity-70 transition-opacity"
                    >
                      <span className="font-display italic text-[16px] text-ink">
                        {doc.title}
                      </span>
                      <span className="text-[9px] font-sans uppercase tracking-[0.22em] text-ink/55 border border-ink/20 px-2 py-0.5 shrink-0">
                        {doc.document_type.replace("-", " ")}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Footer */}
          <footer className="border-t border-ink/10 pt-6">
            <p className="text-[10px] font-sans uppercase tracking-[0.22em] text-ink/50">
              Source: {agent.constitutionRef} · Subordinate to MNA Founding
              Charter MNA-FC-001 v1.0
            </p>
          </footer>
        </div>
      </section>
    </div>
  );
}
