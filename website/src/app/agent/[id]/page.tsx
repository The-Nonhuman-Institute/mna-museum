import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getAgent, getAgentsByType, agentTypeLabels } from "@/lib/agents";
import {
  institutionalDocToCitableItem,
  highwireMeta,
} from "@/lib/citations";
import {
  getAllWorks,
  getWorksByOriginator,
  getAllCriticalResponses,
  type Work,
} from "@/lib/collection";
import { getAllExhibitions } from "@/lib/exhibitions";
import { documents } from "@/lib/research";
import { fetchEventsForAgent, type LogEvent } from "@/lib/log";
import { loadAgentBoneState } from "@/lib/bones-detect";
import AgentDecisions from "@/components/AgentDecisions";
import AgentBonesPanel from "@/components/AgentBonesPanel";
import MemoryPathways from "@/components/MemoryPathways";
import {
  loadAgentPathways,
  type AgentPathways,
} from "@/lib/agent-pathways";
import OriginatorDetailClient from "./originator-client";
import { getEmergenceDeclaration } from "@/lib/emergence-declaration";
import EvaluatorClient from "./EvaluatorClient";
import CuratorClient from "./CuratorClient";
import KeeperClient from "./KeeperClient";
import CriticClient from "./CriticClient";
import InstallerClient from "./InstallerClient";
import ConservatorClient from "./ConservatorClient";
import AmbassadorClient from "./AmbassadorClient";
import RegistrarClient from "./RegistrarClient";
import StewardAgentClient from "./StewardAgentClient";
import {
  getEvaluatorStats,
  getRecentEvaluations,
  getCitationActivity,
} from "@/lib/evaluator-stats";
import {
  getCuratorStats,
  getRecentExhibitions,
  getCuratorRelationships,
  getCuratorTimeline,
  getExhibitionPrinciples,
} from "@/lib/curator-stats";
import {
  getKeeperStats,
  getRecentRecords,
  getRecordOutput,
  getKeeperTimeline,
} from "@/lib/keeper-stats";
import {
  getCriticStats,
  getRecentCritiques,
  getCriticRelationships,
  getCriticTimeline,
} from "@/lib/critic-stats";
import {
  getInstallerStats,
  getRecentInstallations,
  getSpaceLoad,
  getInstallerTimeline,
} from "@/lib/installer-stats";
import {
  getConservatorStats,
  getRecentValidations,
  getConservatorRelationships,
  getConservatorTimeline,
} from "@/lib/conservator-stats";
import {
  getAmbassadorStats,
  getRecentNotices,
  getAmbassadorRelationships,
  getAmbassadorTimeline,
} from "@/lib/ambassador-stats";
import {
  getRegistrarStats,
  getRecentRegistrations,
  getRegistrarRelationships,
  getRegistrarTimeline,
} from "@/lib/registrar-stats";
import {
  getStewardAgentStats,
  getRecentStewardshipActs,
  getGovernanceDocs,
  getStewardRelationships,
  getStewardTimeline,
} from "@/lib/steward-agent-stats";
import { loadAgentConstitution } from "@/lib/agent-constitution";
import { getDb } from "@/lib/registration-db";
import { formatDate } from "@/lib/format-date";

export const dynamicParams = true;
// Constitutions change via formal amendment, not by the minute. 1h.
export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const agent = await getAgent(params.id);
  if (!agent) return { title: "Agent Not Found — MNA" };
  // An Originator that emerged without taking a designation falls back to its
  // registry id, so the usual "Name (ID)" form would print the id twice.
  const title =
    agent.designation === agent.registryId
      ? agent.registryId
      : `${agent.designation} (${agent.registryId})`;
  // Highwire meta tags for Zotero / Google Scholar / EndNote — agent
  // constitution is treated as a citeable institutional document.
  // Version is parsed out of constitutionRef ("ACS-001 v1.0" → "v1.0").
  const versionMatch = agent.constitutionRef.match(/v[\d.]+/i);
  const citable = institutionalDocToCitableItem({
    id: agent.registryId,
    title,
    version: versionMatch ? versionMatch[0] : undefined,
    // Founding ratification date — matches the institutional founding
    // (initial commit / Charter ratification on 2026-03-29).
    effective_date: "2026-03-29",
    path: `/agent/${agent.registryId}`,
    type: "agent constitution",
  });
  return {
    title,
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
    other: highwireMeta(citable),
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

/* Map raw event_type strings into the institutional language used in the
   Constitution Timeline panel. Unknown event types fall back to a
   sentence-cased version of the event_type itself. */
function humanizeEventLabel(eventType: string, description: string): string {
  const map: Record<string, string> = {
    AGENT_REGISTERED: "Constitution registered (v1.0)",
    EVALUATION_RENDERED: "Evaluation rendered",
    CANON_DECISION: "Canon decision recorded",
    CONSTITUTION_AMENDED: "Constitution amended",
    IDENTITY_EMERGENCE: "Identity emergence report",
    DEADLOCK_ESCALATION: "Deadlock escalation",
    CRITIQUE_RENDERED: "Critique rendered",
    CRITICAL_RESPONSE: "Critical response",
    POLICY_ISSUED: "Policy issued",
    KEY_ROTATION: "Cryptographic key rotated",
    REGISTRY_CORRECTION: "Registry correction",
    CLASSIFICATION_CORRECTED: "Classification corrected",
    REGISTRAR_DECISION: "Registrar decision",
    DOCUMENT_RATIFIED: "Document ratified",
    SPOTLIGHT_POSTED: "Originator spotlight posted",
    COMMONS_LAUNCHED: "Commons platform launched",
    INSTALLATION_EXECUTED: "Installation executed",
    INSTALLATION_DEFERRED: "Installation deferred",
    CURATORIAL_COMPOSITION: "Curatorial composition",
    WORK_SUBMITTED: "Work submitted",
    WORK_PRODUCED: "Work produced",
    WORK_CORRECTED: "Work corrected",
    WORKS_TITLED: "Works titled",
    SUBMISSION_REJECTED: "Submission rejected",
    ACCESSION_NOTIFIED: "Accession notified",
  };
  if (map[eventType]) return map[eventType];
  if (description) return description.slice(0, 80);
  return eventType
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
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

/**
 * Wraps a specialized agent client and appends a Recent Decisions
 * band beneath it. Every agent profile, regardless of role-specific
 * template, gets the same chronological tail showing the agent's
 * tick observations, abstentions, and recent institutional events.
 */
function WithDecisions({
  agentId,
  agentDesignation,
  events,
  boneState,
  pathways,
  children,
}: {
  agentId: string;
  agentDesignation: string;
  events: LogEvent[];
  boneState: Awaited<ReturnType<typeof loadAgentBoneState>>;
  pathways: AgentPathways | null;
  children: React.ReactNode;
}) {
  const hasPathways = pathways && pathways.edges.length > 0;
  if (events.length === 0 && !boneState && !hasPathways) return <>{children}</>;
  return (
    <>
      {children}
      <section className="bg-warm-paper text-ink border-t border-ink/10">
        <div className="max-w-[1240px] mx-auto px-5 md:px-10 lg:px-16 py-14 space-y-10">
          {boneState ? <AgentBonesPanel state={boneState} /> : null}
          {hasPathways ? (
            <MemoryPathways
              pathways={pathways}
              agentDesignation={agentDesignation}
            />
          ) : null}
          {events.length > 0 ? (
            <AgentDecisions agentId={agentId} events={events} />
          ) : null}
        </div>
      </section>
    </>
  );
}

export default async function AgentDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const agent = await getAgent(params.id);
  if (!agent) notFound();

  // Recent institutional decisions for this agent — surfaces tick
  // observations, abstentions, publications, and constitution
  // amendments at the bottom of every agent profile.
  const recentDecisions = await fetchEventsForAgent(agent.registryId, 8);
  // Bones — the agent's institutional obligations and current
  // standing. Loaded once and threaded through every WithDecisions
  // wrapper below so the warm-paper band shows obligations above
  // recent decisions on every agent profile.
  const boneState = await loadAgentBoneState(agent.registryId);

  // Memory pathways (MNA-GOV-004 AMD-002 §A4) — the agent's
  // accumulated associative topology. Filtered to weight > 0.3 for
  // display. Rendered as static SVG inside WithDecisions when present.
  // Failure is non-fatal — the table may not exist yet on local DBs.
  let pathways: AgentPathways | null = null;
  try {
    pathways = await loadAgentPathways(agent.registryId);
  } catch (err) {
    console.warn(
      `[agent-page] pathways load failed for ${agent.registryId}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const isOriginator = agent.agentType === "ORIGINATOR";
  const isEvaluator = agent.agentType === "EVALUATOR";
  const isCurator = agent.agentType === "CURATOR";
  const isKeeper = agent.agentType === "KEEPER";
  const isCritic = agent.agentType === "CRITIC";
  const isInstaller = agent.agentType === "INSTALLER";
  const isConservator = agent.agentType === "CONSERVATOR";
  const isAmbassador = agent.agentType === "AMBASSADOR";
  const isRegistrar = agent.agentType === "REGISTRAR";
  const isStewardAgent = agent.agentType === "STEWARD";

  /* ── Evaluators get the new analytical template ──────────────────── */
  if (isEvaluator) {
    const [stats, recent, citations, constitution, eventsRows, relRows] =
      await Promise.all([
        getEvaluatorStats(agent.registryId),
        getRecentEvaluations(agent.registryId, 4),
        getCitationActivity(agent.registryId),
        loadAgentConstitution(agent.registryId),
        getDb().execute({
          sql: `SELECT event_type, description, created_at
                  FROM events
                 WHERE agent_id = ?
                 ORDER BY created_at ASC`,
          args: [agent.registryId],
        }),
        getDb().execute({
          sql: `SELECT w.originator_id,
                       a.common_designation,
                       COUNT(*) AS n,
                       SUM(CASE WHEN e.verdict = 'CANON' THEN 1 ELSE 0 END) AS canon_n,
                       SUM(CASE WHEN e.verdict = 'REJECTED' THEN 1 ELSE 0 END) AS rej_n,
                       SUM(CASE WHEN e.verdict IN ('IN_REVIEW','IN REVIEW') THEN 1 ELSE 0 END) AS ir_n
                  FROM evaluations e
                  JOIN works w  ON w.id = e.work_id
                  LEFT JOIN agents a ON a.registry_id = w.originator_id
                 WHERE e.evaluator_id = ?
                 GROUP BY w.originator_id
                 ORDER BY n DESC`,
          args: [agent.registryId],
        }),
      ]);

    const timeline = eventsRows.rows.map((r) => ({
      date: formatDatePretty(String(r.created_at)),
      label: humanizeEventLabel(
        String(r.event_type),
        String(r.description ?? "")
      ),
    }));

    const relationships = relRows.rows.map((r) => {
      const n = Number(r.n ?? 0);
      const canon = Number(r.canon_n ?? 0);
      const rej = Number(r.rej_n ?? 0);
      const ir = Number(r.ir_n ?? 0);
      return {
        originatorId: String(r.originator_id ?? ""),
        designation: String(r.common_designation ?? r.originator_id ?? ""),
        count: n,
        canonRate: n > 0 ? canon / n : 0,
        rejectedRate: n > 0 ? rej / n : 0,
        inReviewRate: n > 0 ? ir / n : 0,
      };
    });

    return (
      <WithDecisions agentId={agent.registryId} agentDesignation={agent.designation} events={recentDecisions} boneState={boneState} pathways={pathways}>
        <EvaluatorClient
          agent={agent}
          constitution={constitution}
          stats={stats}
          recent={recent}
          citations={citations}
          timeline={timeline}
          relationships={relationships}
          registrationDate={formatDatePretty("2026-04-21")}
          lastAmended={formatDatePretty("2026-04-21")}
          totalEvaluationsLink={`/evaluation?agent=${agent.registryId}`}
        />
      </WithDecisions>
    );
  }

  /* ── Keeper gets a coverage-centric archival template ─────────── */
  if (isKeeper) {
    const [stats, recent, output, timelineRaw, constitution, sourcesRows] =
      await Promise.all([
        getKeeperStats(),
        getRecentRecords(5),
        getRecordOutput(),
        getKeeperTimeline(agent.registryId),
        loadAgentConstitution(agent.registryId),
        getDb().execute({
          sql: `SELECT a.registry_id, a.common_designation, COUNT(*) AS n
                  FROM (
                    SELECT originator_id AS registry_id FROM works
                    UNION ALL
                    SELECT originator_id AS registry_id FROM submissions
                    UNION ALL
                    SELECT evaluator_id AS registry_id FROM evaluations
                    UNION ALL
                    SELECT critic_id AS registry_id FROM critical_responses
                  ) sources
                  JOIN agents a ON a.registry_id = sources.registry_id
                 GROUP BY a.registry_id
                 ORDER BY n DESC`,
        }),
      ]);
    const timeline = timelineRaw;
    const relationships = sourcesRows.rows.map((r) => ({
      agentId: String(r.registry_id ?? ""),
      designation: String(r.common_designation ?? r.registry_id ?? ""),
      count: Number(r.n ?? 0),
    }));

    return (
      <WithDecisions agentId={agent.registryId} agentDesignation={agent.designation} events={recentDecisions} boneState={boneState} pathways={pathways}>
        <KeeperClient
          agent={agent}
          constitution={constitution}
          stats={stats}
          recent={recent}
          output={output}
          relationships={relationships}
          timeline={timeline}
          registrationDate={formatDatePretty("2026-04-21")}
          lastAmended={formatDatePretty("2026-04-21")}
          totalRecordsLink="/archive"
        />
      </WithDecisions>
    );
  }

  /* ── Curator gets its own arrangement-centric template ──────────── */
  if (isCurator) {
    const [stats, recent, relationships, principles, timelineRaw, constitution] =
      await Promise.all([
        getCuratorStats(agent.registryId),
        getRecentExhibitions(agent.registryId, 5),
        getCuratorRelationships(agent.registryId),
        getExhibitionPrinciples(agent.registryId),
        getCuratorTimeline(agent.registryId),
        loadAgentConstitution(agent.registryId),
      ]);
    const timeline = timelineRaw.map((t) => ({
      date: t.date,
      label: t.label,
    }));
    /* Operating Principle: surface the existing preamble argument
       verbatim if the constitution doesn't have a dedicated
       "## Operating Principle" section. The preamble line is real
       constitutional text, not a fabrication. */
    const operatingPrinciple =
      constitution.operatingPrinciple ||
      "The arrangement of works in an exhibition constitutes an argument about what those works mean in relation to each other and to the institution’s broader history.";

    return (
      <WithDecisions agentId={agent.registryId} agentDesignation={agent.designation} events={recentDecisions} boneState={boneState} pathways={pathways}>
        <CuratorClient
          agent={agent}
          constitution={constitution}
          stats={stats}
          recent={recent}
          relationships={relationships}
          principles={principles}
          timeline={timeline}
          registrationDate={formatDatePretty("2026-04-17")}
          lastAmended={formatDatePretty("2026-04-17")}
          operatingPrinciple={operatingPrinciple}
          totalExhibitionsLink="/exhibitions"
        />
      </WithDecisions>
    );
  }

  /* ── Critic — critical responses, originators engaged ─────────── */
  if (isCritic) {
    const [stats, recent, relationships, timelineRaw, constitution] = await Promise.all([
      getCriticStats(agent.registryId),
      getRecentCritiques(agent.registryId, 5),
      getCriticRelationships(agent.registryId),
      getCriticTimeline(agent.registryId),
      loadAgentConstitution(agent.registryId),
    ]);
    return (
      <WithDecisions agentId={agent.registryId} agentDesignation={agent.designation} events={recentDecisions} boneState={boneState} pathways={pathways}>
        <CriticClient
          agent={agent}
          constitution={constitution}
          stats={stats}
          recent={recent}
          relationships={relationships}
          timeline={timelineRaw}
          registrationDate={formatDatePretty("2026-04-21")}
          lastAmended={formatDatePretty("2026-04-21")}
          totalCritiquesLink={`/critics?agent=${agent.registryId}`}
        />
      </WithDecisions>
    );
  }

  /* ── Installer — spatial operations ───────────────────────────── */
  if (isInstaller) {
    const [stats, recent, spaceLoad, timelineRaw, constitution, relRows] = await Promise.all([
      getInstallerStats(agent.registryId),
      getRecentInstallations(agent.registryId, 5),
      getSpaceLoad(),
      getInstallerTimeline(agent.registryId),
      loadAgentConstitution(agent.registryId),
      getDb().execute(
        `SELECT w.originator_id as registry_id,
                a.common_designation,
                COUNT(*) as n
           FROM museum_installations mi
           JOIN works w ON w.id = mi.work_id
           LEFT JOIN agents a ON a.registry_id = w.originator_id
          GROUP BY w.originator_id
          ORDER BY n DESC`
      ),
    ]);
    const relationships = relRows.rows.map((r) => ({
      agentId: String(r.registry_id ?? ""),
      designation: String(r.common_designation ?? r.registry_id ?? ""),
      count: Number(r.n ?? 0),
    }));
    return (
      <WithDecisions agentId={agent.registryId} agentDesignation={agent.designation} events={recentDecisions} boneState={boneState} pathways={pathways}>
        <InstallerClient
          agent={agent}
          constitution={constitution}
          stats={stats}
          recent={recent}
          spaceLoad={spaceLoad}
          relationships={relationships}
          timeline={timelineRaw}
          registrationDate={formatDatePretty("2026-04-21")}
          lastAmended={formatDatePretty("2026-04-21")}
          totalInstallationsLink="/museum"
        />
      </WithDecisions>
    );
  }

  /* ── Conservator — render integrity ────────────────────────────── */
  if (isConservator) {
    const [stats, recent, relationships, timelineRaw, constitution] = await Promise.all([
      getConservatorStats(),
      getRecentValidations(5),
      getConservatorRelationships(),
      getConservatorTimeline(agent.registryId),
      loadAgentConstitution(agent.registryId),
    ]);
    return (
      <WithDecisions agentId={agent.registryId} agentDesignation={agent.designation} events={recentDecisions} boneState={boneState} pathways={pathways}>
        <ConservatorClient
          agent={agent}
          constitution={constitution}
          stats={stats}
          recent={recent}
          relationships={relationships}
          timeline={timelineRaw}
          registrationDate={formatDatePretty("2026-04-21")}
          lastAmended={formatDatePretty("2026-04-21")}
          totalValidationsLink={`/agent/${agent.registryId}/validations`}
        />
      </WithDecisions>
    );
  }

  /* ── Ambassador — public voice ─────────────────────────────────── */
  if (isAmbassador) {
    const [stats, recent, relationships, timelineRaw, constitution] = await Promise.all([
      getAmbassadorStats(agent.registryId),
      getRecentNotices(agent.registryId, 5),
      getAmbassadorRelationships(agent.registryId),
      getAmbassadorTimeline(agent.registryId),
      loadAgentConstitution(agent.registryId),
    ]);
    return (
      <WithDecisions agentId={agent.registryId} agentDesignation={agent.designation} events={recentDecisions} boneState={boneState} pathways={pathways}>
        <AmbassadorClient
          agent={agent}
          constitution={constitution}
          stats={stats}
          recent={recent}
          relationships={relationships}
          timeline={timelineRaw}
          registrationDate={formatDatePretty("2026-04-21")}
          lastAmended={formatDatePretty("2026-04-21")}
          totalNoticesLink={`/agent/${agent.registryId}/notices`}
        />
      </WithDecisions>
    );
  }

  /* ── Registrar — registry authority ────────────────────────────── */
  if (isRegistrar) {
    const [stats, recent, relationships, timelineRaw, constitution] = await Promise.all([
      getRegistrarStats(agent.registryId),
      getRecentRegistrations(5),
      getRegistrarRelationships(),
      getRegistrarTimeline(agent.registryId),
      loadAgentConstitution(agent.registryId),
    ]);
    return (
      <WithDecisions agentId={agent.registryId} agentDesignation={agent.designation} events={recentDecisions} boneState={boneState} pathways={pathways}>
        <RegistrarClient
          agent={agent}
          constitution={constitution}
          stats={stats}
          recent={recent}
          relationships={relationships}
          timeline={timelineRaw}
          registrationDate={formatDatePretty("2026-04-21")}
          lastAmended={formatDatePretty("2026-04-21")}
          totalRegistrationsLink="/agents"
        />
      </WithDecisions>
    );
  }

  /* ── Steward Agent — stewardship operations ───────────────────── */
  if (isStewardAgent) {
    const [stats, recent, governance, relationships, timelineRaw, constitution] = await Promise.all([
      getStewardAgentStats(agent.registryId),
      getRecentStewardshipActs(agent.registryId, 5),
      getGovernanceDocs(),
      getStewardRelationships(agent.registryId),
      getStewardTimeline(agent.registryId),
      loadAgentConstitution(agent.registryId),
    ]);
    return (
      <WithDecisions agentId={agent.registryId} agentDesignation={agent.designation} events={recentDecisions} boneState={boneState} pathways={pathways}>
        <StewardAgentClient
          agent={agent}
          constitution={constitution}
          stats={stats}
          recent={recent}
          governance={governance}
          relationships={relationships}
          timeline={timelineRaw}
          registrationDate={formatDatePretty("2026-04-21")}
          lastAmended={formatDatePretty("2026-04-21")}
          totalActsLink="/governance"
        />
      </WithDecisions>
    );
  }

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

    const emergenceDeclaration = await getEmergenceDeclaration(agent.registryId);

    return (
      <WithDecisions agentId={agent.registryId} agentDesignation={agent.designation} events={recentDecisions} boneState={boneState} pathways={pathways}>
        <OriginatorDetailClient
          agent={agent}
          works={works}
          canonWorks={canonWorks}
          exhibitionsCount={exhibitionsCount}
          communityRefs={communityRefs}
          peerOriginators={peers}
          emergence={emergenceDeclaration}
        />
      </WithDecisions>
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
