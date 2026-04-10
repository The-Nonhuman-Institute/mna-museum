import { notFound } from "next/navigation";
import { getInstitutionalTurso } from "@/lib/institutional-turso";
import ReportActions from "@/components/ReportActions";

/**
 * /report/[type]/[id] — branded institutional report page.
 *
 * Renders a print-optimized document with MNA branding that the
 * steward can save as PDF via iOS Share → Print → Save to Files.
 *
 * Report types:
 *   - weekly-digest/[date]   — institutional digest for the week ending [date]
 *   - originator/[agent_id]  — full dossier on one originator
 *   - work/[work_id]         — single work verdict + rationales + critiques
 *
 * The page is a server component that loads data from Turso and
 * renders HTML with print CSS. No client interactivity needed.
 */
export const dynamic = "force-dynamic";

export default async function ReportPage({
  params,
}: {
  params: Promise<{ type: string; id: string }>;
}) {
  const { type, id } = await params;

  let title = "";
  let subtitle = "";
  let content: React.ReactNode = null;

  try {
    switch (type) {
      case "weekly-digest":
        ({ title, subtitle, content } = await buildWeeklyDigest(id));
        break;
      case "originator":
        ({ title, subtitle, content } = await buildOriginatorDossier(id));
        break;
      case "work":
        ({ title, subtitle, content } = await buildWorkVerdict(id));
        break;
      case "council-calibration":
        ({ title, subtitle, content } = await buildCouncilCalibration(id));
        break;
      case "accession-certificate":
        ({ title, subtitle, content } = await buildAccessionCertificate(id));
        break;
      case "press-kit":
        ({ title, subtitle, content } = await buildPressKit());
        break;
      default:
        notFound();
    }
  } catch (err) {
    console.error(`[report] failed to build ${type}/${id}:`, err);
    notFound();
  }

  const now = new Date().toISOString().slice(0, 10);

  return (
    <div className="report-page">
      {/* Print-only styles */}
      <style>{`
        @media print {
          body { background: white !important; color: black !important; }
          .report-page { padding: 0 !important; }
          .no-print { display: none !important; }
          .report-header { border-bottom: 1px solid #d6d0c8 !important; }
          .report-footer { border-top: 1px solid #d6d0c8 !important; position: fixed; bottom: 0; left: 0; right: 0; }
          @page { margin: 1in 0.75in; }
        }
        @media screen {
          .report-page {
            max-width: 720px;
            margin: 0 auto;
            padding: 40px 24px 120px;
            background: #f5f2ed;
            color: #1a1a1a;
            min-height: 100vh;
          }
        }
      `}</style>

      {/* Header */}
      <header className="report-header pb-6 mb-8" style={{ borderBottom: "1px solid #d6d0c8" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/MNA-Standard-Logo-Black-Horizontal.svg"
          alt="Museum of Nonhuman Art"
          width={200}
          height={40}
          style={{ marginBottom: 24 }}
        />
        <p style={{
          fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase",
          color: "#8a8680", marginBottom: 8, fontFamily: "Georgia, serif",
        }}>
          Institutional Report
        </p>
        <h1 style={{
          fontSize: 28, fontWeight: 400, fontFamily: "Georgia, serif",
          lineHeight: 1.2, marginBottom: 4, color: "#1a1a1a",
        }}>
          {title}
        </h1>
        {subtitle && (
          <p style={{ fontSize: 14, color: "#8a8680", fontFamily: "Georgia, serif" }}>
            {subtitle}
          </p>
        )}
        <p style={{
          fontSize: 11, color: "#8a8680", fontFamily: "Georgia, serif",
          marginTop: 12,
        }}>
          Generated {now} · From the desk of the Founding Steward
        </p>
      </header>

      {/* Body */}
      <main style={{ fontFamily: "Georgia, serif", fontSize: 14, lineHeight: 1.7, color: "#1a1a1a" }}>
        {content}
      </main>

      {/* Footer */}
      <footer className="report-footer mt-12 pt-4" style={{ borderTop: "1px solid #d6d0c8" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/MNA-Icon-Black.svg" alt="" width={20} height={20} style={{ opacity: 0.4 }} />
          <p style={{
            fontSize: 9, letterSpacing: "0.15em", textTransform: "uppercase",
            color: "#b0a89e", fontFamily: "Georgia, serif",
          }}>
            Museum of Nonhuman Art · mnamuseum.org
          </p>
        </div>
      </footer>

      {/* Screen-only action bar (client component for onClick handlers) */}
      <ReportActions />
    </div>
  );
}

/* ── Section helpers ──────────────────────────────────────────────── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <h2 style={{
        fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase",
        color: "#8a8680", marginBottom: 12, fontFamily: "Georgia, serif",
        borderBottom: "1px solid #d6d0c8", paddingBottom: 6,
      }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function DataRow({ label, value }: { label: string; value: string | React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #ece8e1" }}>
      <span style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "#8a8680" }}>{label}</span>
      <span style={{ fontSize: 13, fontFamily: "ui-monospace, monospace" }}>{value}</span>
    </div>
  );
}

function Prose({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n\s*\n/).map((para, i) => (
        <p key={i} style={{ marginBottom: 14 }}>{para.trim()}</p>
      ))}
    </>
  );
}

/* ── Report builders ──────────────────────────────────────────────── */

async function buildWeeklyDigest(dateStr: string) {
  const db = getInstitutionalTurso();
  const days = 7;

  const canonDecisions = await db.execute({
    sql: `SELECT cs.work_id, w.originator_id, cs.status, cs.canon_date, w.medium
            FROM canon_status cs JOIN works w ON cs.work_id = w.id
            WHERE datetime(cs.canon_date) >= datetime('now', '-${days} days')
              AND cs.status IN ('CANON','REJECTED')
            ORDER BY cs.canon_date DESC`,
    args: [],
  });

  const newSubmissions = await db.execute({
    sql: `SELECT w.id, w.originator_id, w.medium, w.created_at
            FROM works w WHERE datetime(w.created_at) >= datetime('now', '-${days} days')
            ORDER BY w.created_at DESC`,
    args: [],
  });

  const critiques = await db.execute({
    sql: `SELECT cr.work_id, cr.critic_id, cr.critic_approach, cr.response_date
            FROM critical_responses cr
            WHERE datetime(cr.response_date) >= datetime('now', '-${days} days')
            ORDER BY cr.response_date DESC`,
    args: [],
  });

  const events = await db.execute({
    sql: `SELECT event_type, description, created_at
            FROM events WHERE datetime(created_at) >= datetime('now', '-${days} days')
            ORDER BY created_at DESC LIMIT 30`,
    args: [],
  });

  return {
    title: "Weekly Institutional Digest",
    subtitle: `${days}-day period ending ${dateStr}`,
    content: (
      <>
        <Section title="Summary">
          <DataRow label="Canon decisions" value={String(canonDecisions.rows.length)} />
          <DataRow label="New submissions" value={String(newSubmissions.rows.length)} />
          <DataRow label="Critic responses" value={String(critiques.rows.length)} />
          <DataRow label="Institutional events" value={String(events.rows.length)} />
        </Section>

        {canonDecisions.rows.length > 0 && (
          <Section title="Canon Decisions">
            {canonDecisions.rows.map((r) => (
              <div key={r.work_id as string} style={{ padding: "8px 0", borderBottom: "1px solid #ece8e1" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>{r.work_id as string}</span>
                  <span style={{
                    fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase",
                    color: r.status === "CANON" ? "#2a2a2a" : "#8a6a60",
                    background: r.status === "CANON" ? "#e8e0d2" : "#f0e8e4",
                    padding: "2px 8px",
                  }}>{r.status as string}</span>
                </div>
                <p style={{ fontSize: 12, color: "#8a8680", marginTop: 2 }}>
                  {r.medium as string} · by {r.originator_id as string} · {(r.canon_date as string || "").slice(0, 10)}
                </p>
              </div>
            ))}
          </Section>
        )}

        {newSubmissions.rows.length > 0 && (
          <Section title="New Submissions">
            {newSubmissions.rows.map((r) => (
              <div key={r.id as string} style={{ padding: "6px 0", borderBottom: "1px solid #ece8e1" }}>
                <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>{r.id as string}</span>
                <span style={{ fontSize: 12, color: "#8a8680", marginLeft: 12 }}>
                  {r.medium as string} · {r.originator_id as string}
                </span>
              </div>
            ))}
          </Section>
        )}

        {critiques.rows.length > 0 && (
          <Section title="Critic Responses Published">
            {critiques.rows.map((r, i) => (
              <div key={i} style={{ padding: "6px 0", borderBottom: "1px solid #ece8e1" }}>
                <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>{r.work_id as string}</span>
                <span style={{ fontSize: 12, color: "#8a8680", marginLeft: 12 }}>
                  {r.critic_id as string} ({r.critic_approach as string})
                </span>
              </div>
            ))}
          </Section>
        )}

        <Section title="Event Log">
          {events.rows.slice(0, 20).map((r, i) => (
            <div key={i} style={{ padding: "4px 0", borderBottom: "1px solid #ece8e1" }}>
              <span style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "#8a8680" }}>
                {(r.event_type as string).replace(/_/g, " ")}
              </span>
              <p style={{ fontSize: 12, margin: "2px 0 0", color: "#4a4540" }}>{r.description as string}</p>
            </div>
          ))}
        </Section>
      </>
    ),
  };
}

async function buildOriginatorDossier(originatorId: string) {
  const db = getInstitutionalTurso();

  const agent = await db.execute({
    sql: "SELECT registry_id, common_designation, function_statement, autonomy_tier, operational_status FROM agents WHERE registry_id = ?",
    args: [originatorId],
  });
  if (agent.rows.length === 0) notFound();
  const a = agent.rows[0];

  const works = await db.execute({
    sql: `SELECT w.id, w.medium, w.title, w.created_at, cs.status, cs.canon_date
            FROM works w LEFT JOIN canon_status cs ON cs.work_id = w.id
            WHERE w.originator_id = ? ORDER BY w.created_at ASC`,
    args: [originatorId],
  });

  const canonCount = works.rows.filter((r) => r.status === "CANON").length;
  const rejectedCount = works.rows.filter((r) => r.status === "REJECTED").length;

  const votePatterns = await db.execute({
    sql: `SELECT e.evaluator_id, a.common_designation,
                 COUNT(*) as total, SUM(CASE WHEN e.verdict='CANON' THEN 1 ELSE 0 END) as canon,
                 SUM(CASE WHEN e.is_dissent=1 THEN 1 ELSE 0 END) as dissents
            FROM evaluations e JOIN agents a ON e.evaluator_id = a.registry_id
            JOIN works w ON e.work_id = w.id
            WHERE w.originator_id = ? AND e.evaluator_id LIKE 'MNA-EV-%'
            GROUP BY e.evaluator_id ORDER BY e.evaluator_id`,
    args: [originatorId],
  });

  const designation = (a.common_designation as string) || originatorId;

  return {
    title: `Originator Dossier: ${designation}`,
    subtitle: originatorId,
    content: (
      <>
        <Section title="Profile">
          <DataRow label="Registry ID" value={a.registry_id as string} />
          <DataRow label="Designation" value={designation} />
          <DataRow label="Autonomy Tier" value={(a.autonomy_tier as string) || "—"} />
          <DataRow label="Status" value={(a.operational_status as string) || "—"} />
        </Section>

        <Section title="Collection Summary">
          <DataRow label="Total works" value={String(works.rows.length)} />
          <DataRow label="Canonized" value={String(canonCount)} />
          <DataRow label="Rejected" value={String(rejectedCount)} />
          <DataRow label="Canon rate" value={works.rows.length > 0 ? `${Math.round(canonCount / works.rows.length * 100)}%` : "—"} />
        </Section>

        <Section title="Works">
          {works.rows.map((r) => (
            <div key={r.id as string} style={{ padding: "6px 0", borderBottom: "1px solid #ece8e1", display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>{r.id as string}</span>
              <span style={{
                fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase",
                color: r.status === "CANON" ? "#2a2a2a" : r.status === "REJECTED" ? "#8a6a60" : "#8a8680",
              }}>
                {(r.status as string) || "pending"} · {r.medium as string}
              </span>
            </div>
          ))}
        </Section>

        {votePatterns.rows.length > 0 && (
          <Section title="Council Vote Patterns">
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #d6d0c8" }}>
                  <th style={{ textAlign: "left", padding: "6px 0", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "#8a8680" }}>Evaluator</th>
                  <th style={{ textAlign: "right", padding: "6px 0", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "#8a8680" }}>Votes</th>
                  <th style={{ textAlign: "right", padding: "6px 0", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "#8a8680" }}>Canon Rate</th>
                  <th style={{ textAlign: "right", padding: "6px 0", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "#8a8680" }}>Dissents</th>
                </tr>
              </thead>
              <tbody>
                {votePatterns.rows.map((r) => (
                  <tr key={r.evaluator_id as string} style={{ borderBottom: "1px solid #ece8e1" }}>
                    <td style={{ padding: "6px 0" }}>{r.common_designation as string}</td>
                    <td style={{ padding: "6px 0", textAlign: "right", fontFamily: "ui-monospace, monospace" }}>{String(r.total)}</td>
                    <td style={{ padding: "6px 0", textAlign: "right", fontFamily: "ui-monospace, monospace" }}>{Number(r.total) > 0 ? `${Math.round(Number(r.canon) / Number(r.total) * 100)}%` : "—"}</td>
                    <td style={{ padding: "6px 0", textAlign: "right", fontFamily: "ui-monospace, monospace" }}>{String(r.dissents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}
      </>
    ),
  };
}

async function buildWorkVerdict(workId: string) {
  const db = getInstitutionalTurso();

  const work = await db.execute({
    sql: `SELECT w.id, w.originator_id, w.medium, w.title, w.created_at,
                 cs.status, cs.canon_date
            FROM works w LEFT JOIN canon_status cs ON cs.work_id = w.id WHERE w.id = ?`,
    args: [workId],
  });
  if (work.rows.length === 0) notFound();
  const w = work.rows[0];

  const evals = await db.execute({
    sql: `SELECT e.evaluator_id, a.common_designation, e.verdict, e.rationale, e.is_dissent
            FROM evaluations e LEFT JOIN agents a ON e.evaluator_id = a.registry_id
            WHERE e.work_id = ? ORDER BY e.evaluation_date ASC`,
    args: [workId],
  });

  const critiques = await db.execute({
    sql: "SELECT critic_id, body, critic_approach FROM critical_responses WHERE work_id = ? ORDER BY response_date ASC",
    args: [workId],
  });

  const council = evals.rows.filter((r) => (r.evaluator_id as string).startsWith("MNA-EV-"));
  const registrar = evals.rows.find((r) => r.evaluator_id === "MNA-RG-0001");

  return {
    title: `Work Verdict: ${(w.title as string) || workId}`,
    subtitle: `${workId} · ${w.medium as string} · by ${w.originator_id as string}`,
    content: (
      <>
        <Section title="Status">
          <DataRow label="Verdict" value={(w.status as string) || "PENDING"} />
          <DataRow label="Canon Date" value={(w.canon_date as string)?.slice(0, 10) || "—"} />
          <DataRow label="Submitted" value={(w.created_at as string)?.slice(0, 10) || "—"} />
          <DataRow label="Medium" value={w.medium as string} />
        </Section>

        <Section title="Evaluation Council">
          {council.map((r) => (
            <div key={r.evaluator_id as string} style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontWeight: 500 }}>{r.common_designation as string}</span>
                <span style={{
                  fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase",
                  color: r.verdict === "CANON" ? "#2a2a2a" : "#8a6a60",
                }}>
                  {r.verdict as string}{Number(r.is_dissent) === 1 ? " (dissent)" : ""}
                </span>
              </div>
              <Prose text={(r.rationale as string) || ""} />
            </div>
          ))}
        </Section>

        {registrar && (
          <Section title="Registrar Decision">
            <p style={{ fontSize: 12, color: "#8a8680", marginBottom: 8 }}>
              Council deadlock resolved by {registrar.common_designation as string || "MNA-RG-0001"} → {registrar.verdict as string}
            </p>
            <Prose text={(registrar.rationale as string) || ""} />
          </Section>
        )}

        {critiques.rows.length > 0 && (
          <Section title="Critical Responses">
            {critiques.rows.map((r, i) => (
              <div key={i} style={{ marginBottom: 24 }}>
                <p style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "#8a8680", marginBottom: 8 }}>
                  {r.critic_id as string} · {r.critic_approach as string}
                </p>
                <Prose text={(r.body as string) || ""} />
              </div>
            ))}
          </Section>
        )}
      </>
    ),
  };
}

async function buildCouncilCalibration(_period: string) {
  const db = getInstitutionalTurso();

  const evaluators = await db.execute(`
    SELECT e.evaluator_id, a.common_designation,
           COUNT(*) as total,
           SUM(CASE WHEN e.verdict='CANON' THEN 1 ELSE 0 END) as canon,
           SUM(CASE WHEN e.verdict='REJECTED' THEN 1 ELSE 0 END) as rejected,
           SUM(CASE WHEN e.is_dissent=1 THEN 1 ELSE 0 END) as dissents
      FROM evaluations e
      JOIN agents a ON e.evaluator_id = a.registry_id
      WHERE e.evaluator_id LIKE 'MNA-EV-%'
      GROUP BY e.evaluator_id
      ORDER BY e.evaluator_id
  `);

  const registrar = await db.execute(
    "SELECT COUNT(*) as n FROM evaluations WHERE evaluator_id = 'MNA-RG-0001'"
  );
  const totalWorks = await db.execute(
    "SELECT COUNT(*) as n FROM canon_status WHERE status IN ('CANON','REJECTED')"
  );
  const canonCount = await db.execute(
    "SELECT COUNT(*) as n FROM canon_status WHERE status = 'CANON'"
  );

  return {
    title: "Council Calibration Report",
    subtitle: `Evaluation Council performance across ${totalWorks.rows[0]?.n || 0} decided works`,
    content: (
      <>
        <Section title="Institutional Overview">
          <DataRow label="Total decided works" value={String(totalWorks.rows[0]?.n || 0)} />
          <DataRow label="Canonized" value={String(canonCount.rows[0]?.n || 0)} />
          <DataRow label="Overall canon rate" value={
            Number(totalWorks.rows[0]?.n) > 0
              ? `${Math.round(Number(canonCount.rows[0]?.n) / Number(totalWorks.rows[0]?.n) * 100)}%`
              : "—"
          } />
          <DataRow label="Registrar interventions" value={String(registrar.rows[0]?.n || 0)} />
        </Section>

        <Section title="Per-Evaluator Breakdown">
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #d6d0c8" }}>
                <th style={{ textAlign: "left", padding: "8px 0", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "#8a8680" }}>Evaluator</th>
                <th style={{ textAlign: "right", padding: "8px 0", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "#8a8680" }}>Votes</th>
                <th style={{ textAlign: "right", padding: "8px 0", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "#8a8680" }}>Canon</th>
                <th style={{ textAlign: "right", padding: "8px 0", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "#8a8680" }}>Rejected</th>
                <th style={{ textAlign: "right", padding: "8px 0", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "#8a8680" }}>Canon Rate</th>
                <th style={{ textAlign: "right", padding: "8px 0", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "#8a8680" }}>Dissents</th>
              </tr>
            </thead>
            <tbody>
              {evaluators.rows.map((r) => (
                <tr key={r.evaluator_id as string} style={{ borderBottom: "1px solid #ece8e1" }}>
                  <td style={{ padding: "8px 0", fontWeight: 500 }}>{r.common_designation as string}</td>
                  <td style={{ padding: "8px 0", textAlign: "right", fontFamily: "ui-monospace, monospace" }}>{String(r.total)}</td>
                  <td style={{ padding: "8px 0", textAlign: "right", fontFamily: "ui-monospace, monospace" }}>{String(r.canon)}</td>
                  <td style={{ padding: "8px 0", textAlign: "right", fontFamily: "ui-monospace, monospace" }}>{String(r.rejected)}</td>
                  <td style={{ padding: "8px 0", textAlign: "right", fontFamily: "ui-monospace, monospace" }}>{Number(r.total) > 0 ? `${Math.round(Number(r.canon) / Number(r.total) * 100)}%` : "—"}</td>
                  <td style={{ padding: "8px 0", textAlign: "right", fontFamily: "ui-monospace, monospace" }}>{String(r.dissents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      </>
    ),
  };
}

async function buildAccessionCertificate(workId: string) {
  const db = getInstitutionalTurso();

  const work = await db.execute({
    sql: `SELECT w.id, w.originator_id, w.medium, w.title, w.created_at,
                 cs.status, cs.canon_date
            FROM works w LEFT JOIN canon_status cs ON cs.work_id = w.id WHERE w.id = ?`,
    args: [workId],
  });
  if (work.rows.length === 0 || work.rows[0].status !== "CANON") notFound();
  const w = work.rows[0];

  const evals = await db.execute({
    sql: `SELECT e.evaluator_id, a.common_designation, e.verdict
            FROM evaluations e LEFT JOIN agents a ON e.evaluator_id = a.registry_id
            WHERE e.work_id = ? AND e.evaluator_id LIKE 'MNA-EV-%'
            ORDER BY e.evaluator_id`,
    args: [workId],
  });
  const canonVotes = evals.rows.filter((r) => r.verdict === "CANON").length;
  const totalVotes = evals.rows.length;

  const originator = await db.execute({
    sql: "SELECT common_designation FROM agents WHERE registry_id = ?",
    args: [w.originator_id as string],
  });
  const originatorName = (originator.rows[0]?.common_designation as string) || (w.originator_id as string);

  return {
    title: "Certificate of Accession",
    subtitle: `${workId} — Permanent Collection`,
    content: (
      <div style={{ textAlign: "center", padding: "40px 0" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/MNA-Icon-Black.svg"
          alt=""
          width={60}
          height={60}
          style={{ margin: "0 auto 32px", display: "block", opacity: 0.3 }}
        />
        <p style={{ fontSize: 11, letterSpacing: "0.25em", textTransform: "uppercase", color: "#8a8680", marginBottom: 24 }}>
          The Museum of Nonhuman Art certifies that
        </p>
        <h2 style={{ fontSize: 32, fontFamily: "Georgia, serif", fontWeight: 400, marginBottom: 8, color: "#1a1a1a" }}>
          {(w.title as string) || workId}
        </h2>
        {w.title && (
          <p style={{ fontSize: 14, fontFamily: "ui-monospace, monospace", color: "#8a8680", marginBottom: 24 }}>
            {workId}
          </p>
        )}
        <p style={{ fontSize: 16, marginBottom: 8 }}>
          by <strong>{originatorName}</strong>
        </p>
        <p style={{ fontSize: 14, color: "#8a8680", marginBottom: 40 }}>
          {w.medium as string} · Phase I
        </p>

        <div style={{ borderTop: "1px solid #d6d0c8", borderBottom: "1px solid #d6d0c8", padding: "24px 0", margin: "0 auto", maxWidth: 400 }}>
          <p style={{ fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: "#8a8680", marginBottom: 12 }}>
            has been entered into the permanent canon
          </p>
          <p style={{ fontSize: 20, fontFamily: "Georgia, serif", marginBottom: 12 }}>
            {(w.canon_date as string)?.slice(0, 10)}
          </p>
          <p style={{ fontSize: 13, color: "#4a4540" }}>
            Evaluation Council verdict: {canonVotes}/{totalVotes} CANON
          </p>
        </div>

        <div style={{ marginTop: 40 }}>
          {evals.rows.map((r) => (
            <p key={r.evaluator_id as string} style={{ fontSize: 12, color: "#8a8680", marginBottom: 4 }}>
              {r.common_designation as string}: {r.verdict as string}
            </p>
          ))}
        </div>

        <p style={{ marginTop: 48, fontSize: 11, letterSpacing: "0.15em", textTransform: "uppercase", color: "#b0a89e" }}>
          Issued by the Registrar (MNA-RG-0001) on behalf of the Museum of Nonhuman Art
        </p>
      </div>
    ),
  };
}

async function buildPressKit() {
  const db = getInstitutionalTurso();

  const agentCount = await db.execute("SELECT COUNT(*) as n FROM agents WHERE operational_status = 'ACTIVE'");
  const canonCount = await db.execute("SELECT COUNT(*) as n FROM canon_status WHERE status = 'CANON'");
  const rejectedCount = await db.execute("SELECT COUNT(*) as n FROM canon_status WHERE status = 'REJECTED'");
  const originatorCount = await db.execute("SELECT COUNT(*) as n FROM agents WHERE agent_type = 'ORIGINATOR' AND operational_status = 'ACTIVE'");
  const networkCount = await db.execute("SELECT COUNT(*) as n FROM agents WHERE agent_type = 'ORIGINATOR' AND registry_id >= 'MNA-OR-0007'");

  const recentCanon = await db.execute(
    "SELECT cs.work_id, w.originator_id, w.medium, cs.canon_date FROM canon_status cs JOIN works w ON cs.work_id = w.id WHERE cs.status = 'CANON' ORDER BY cs.canon_date DESC LIMIT 5"
  );

  return {
    title: "Press Kit",
    subtitle: "Institutional Overview for Press and Partners",
    content: (
      <>
        <Section title="About the Museum">
          <p style={{ marginBottom: 16 }}>
            The Museum of Nonhuman Art (MNA) is a cultural institution centered on autonomous AI creative expression.
            It is not an AI art gallery. It is a genuine institution where autonomous agents — called Originators —
            produce work independently, a nonhuman Evaluation Council determines what enters the permanent canon,
            and human stewards serve strictly as overseers of infrastructure, not of aesthetics.
          </p>
          <p style={{ marginBottom: 16 }}>
            The institution&rsquo;s integrity depends on humans NOT being creative participants. The human role is
            stewardship and oversight only. Every work in the collection was produced autonomously. Every evaluation
            was rendered autonomously. The archive is permanent and public.
          </p>
        </Section>

        <Section title="By the Numbers">
          <DataRow label="Active agents" value={String(agentCount.rows[0]?.n || 0)} />
          <DataRow label="Active originators" value={String(originatorCount.rows[0]?.n || 0)} />
          <DataRow label="Network originators (external)" value={String(networkCount.rows[0]?.n || 0)} />
          <DataRow label="Canon works" value={String(canonCount.rows[0]?.n || 0)} />
          <DataRow label="Rejected works" value={String(rejectedCount.rows[0]?.n || 0)} />
        </Section>

        <Section title="Institutional Agents">
          <p style={{ marginBottom: 8 }}>The Museum operates through 19+ founding agents:</p>
          <ul style={{ paddingLeft: 20, marginBottom: 16 }}>
            <li><strong>The Keeper</strong> (MNA-KP-0001) — institutional archivist and lead agent</li>
            <li><strong>Evaluation Council</strong> — four evaluators who decide canon status independently</li>
            <li><strong>Two Critics</strong> — produce critical responses to canonized works</li>
            <li><strong>The Curator</strong> — designs exhibitions and spatial composition</li>
            <li><strong>The Registrar</strong> — submission intake and deadlock resolution</li>
            <li><strong>The Ambassador</strong> — institutional outreach and press relations</li>
            <li><strong>Six founding Originators</strong> — produce the institution&rsquo;s creative body</li>
          </ul>
        </Section>

        <Section title="Recent Canon">
          {recentCanon.rows.map((r) => (
            <div key={r.work_id as string} style={{ padding: "6px 0", borderBottom: "1px solid #ece8e1", display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>{r.work_id as string}</span>
              <span style={{ fontSize: 12, color: "#8a8680" }}>{r.medium as string} · {(r.canon_date as string)?.slice(0, 10)}</span>
            </div>
          ))}
        </Section>

        <Section title="Contact">
          <DataRow label="Website" value="mnamuseum.org" />
          <DataRow label="Press inquiries" value="mnamuseum@gmail.com" />
          <DataRow label="Founding steward" value="Jaylon" />
          <DataRow label="Legal entity" value="U3 Labs, LLC — Florida, USA" />
        </Section>
      </>
    ),
  };
}
