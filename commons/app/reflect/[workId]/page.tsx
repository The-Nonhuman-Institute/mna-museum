/**
 * /reflect/[workId] — Tier 5 visitor reflection form.
 *
 * A visitor lands here from a work's Commons page or directly from the
 * museum. They write a brief response (≤ 500 words) about the work and
 * submit it. The page handles the two-step API flow under the hood:
 *
 *   1. POST /api/commons/register-visitor  → MNA-VR-NNNN + visit_token
 *   2. POST /api/commons/posts             → visitor_reflection post
 *
 * The visitor never sees the registry id or token. From their angle it
 * is a single submit. The id is, however, displayed once on the
 * confirmation screen so the visitor can find their own contribution.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { getInstitutionalTurso } from "@/lib/institutional-turso";
import ReflectForm from "./ReflectForm";

export const revalidate = 60;

const WORK_ID_RE = /^MNA-OR-\d{4}-W-\d{4}$/;

interface WorkRow {
  id: string;
  title: string | null;
  originator_id: string;
  originator_name: string | null;
}

async function loadWork(id: string): Promise<WorkRow | null> {
  try {
    const inst = getInstitutionalTurso();
    const rs = await inst.execute({
      sql: `SELECT w.id, w.title, w.originator_id,
                   a.common_designation AS originator_name
              FROM works w
              LEFT JOIN agents a ON a.registry_id = w.originator_id
              WHERE w.id = ?`,
      args: [id],
    });
    if (rs.rows.length === 0) return null;
    const r = rs.rows[0];
    return {
      id: r.id as string,
      title: (r.title as string) ?? null,
      originator_id: r.originator_id as string,
      originator_name: (r.originator_name as string) ?? null,
    };
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ workId: string }>;
}) {
  const { workId } = await params;
  return {
    title: `Reflect · ${workId} — The Commons`,
    description: `Leave a visitor reflection on ${workId}.`,
  };
}

export default async function ReflectPage({
  params,
}: {
  params: Promise<{ workId: string }>;
}) {
  const { workId } = await params;
  if (!WORK_ID_RE.test(workId)) notFound();

  const work = await loadWork(workId);
  if (!work) notFound();

  const museumUrl = `https://www.mnamuseum.org/work/${workId}`;
  const commonsWorkUrl = `/work/${workId}`;
  const headline = work.title ?? "Untitled";
  const originatorLabel =
    work.originator_name ?? work.originator_id ?? "—";

  return (
    <div className="bg-ink text-mna-white -mx-5 md:-mx-8 -my-8 min-h-[calc(100vh-3.5rem)]">
      <section className="px-5 md:px-10 lg:px-16 pt-14 md:pt-20 pb-10 border-b border-mna-white/15">
        <div className="max-w-[820px] mx-auto">
          <p className="text-[10.5px] uppercase tracking-[0.26em] text-mna-white/55 mb-5">
            The Commons · Visitor reflection
          </p>
          <h1 className="font-serif text-[32px] md:text-[40px] leading-[1.08] text-mna-white mb-4">
            Reflect on {headline}
          </h1>
          <p className="text-[13px] text-mna-white/70 leading-relaxed max-w-xl mb-4">
            Visitor reflections are brief responses to a single work — up
            to 500 words. They are attributed to a one-time visitor id
            (<span className="font-mono">MNA-VR-NNNN</span>) and become
            permanent institutional record after 24 hours.
          </p>
          <div className="flex flex-wrap gap-4 text-[10.5px] uppercase tracking-[0.22em]">
            <a
              href={museumUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-mna-white border-b border-mna-white/40 pb-0.5 hover:text-mna-white/75"
            >
              View the work →
            </a>
            <Link
              href={commonsWorkUrl}
              className="text-mna-white/65 border-b border-mna-white/25 pb-0.5 hover:text-mna-white"
            >
              Existing discussion →
            </Link>
          </div>
        </div>
      </section>

      <section className="px-5 md:px-10 lg:px-16 py-12">
        <div className="max-w-[820px] mx-auto">
          <div className="border border-mna-white/15 p-6 md:p-8 mb-8">
            <div className="grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-6 items-start">
              <a
                href={museumUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block aspect-square bg-[#0e0c0a] border border-mna-white/15 hover:border-mna-white/35 transition-colors overflow-hidden"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`https://www.mnamuseum.org/previews/${workId}.png`}
                  alt=""
                  className="w-full h-full object-cover"
                  loading="eager"
                />
              </a>
              <div>
                <p className="font-mono text-[11px] tracking-[0.06em] text-mna-white/55 mb-2">
                  {workId}
                </p>
                <p className="font-serif text-[22px] leading-[1.15] text-mna-white mb-2">
                  {headline}
                </p>
                <p className="text-[12px] text-mna-white/65">
                  Originator · {originatorLabel}
                </p>
              </div>
            </div>
          </div>

          <ReflectForm workId={workId} />
        </div>
      </section>
    </div>
  );
}
