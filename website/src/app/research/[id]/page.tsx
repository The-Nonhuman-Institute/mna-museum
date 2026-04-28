/**
 * /research/[id] — single research document.
 *
 * Layout:
 *   - Dark hero band: back link + badge/id/scratch + title + abstract +
 *     meta strip
 *   - Two-column body: prose (left, ~70%) + right rail (~30%)
 *     - rail panels: Document Details / Referenced Works (with procedural
 *       glyphs) / Referenced Agents / Cite This Document / Download
 *   - End-of-document footer with sibling research from the same author
 *
 * The prose stays as ResearchBody (client) to preserve inline work-ref
 * modals; everything else is a server component.
 */

import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  documents,
  getDocument,
  documentTypeLabels,
  type ResearchDocument,
} from "@/lib/research";
import { getWork } from "@/lib/collection";
import type { Work } from "@/lib/collection";
import ResearchBody from "@/components/ResearchBody";
import MNAGlyph, { pickFamily } from "@/components/MNAGlyph";
import CiteButton from "@/components/CiteButton";

export function generateStaticParams() {
  return documents.map((d) => ({ id: d.registry_id }));
}

export function generateMetadata({
  params,
}: {
  params: { id: string };
}): Metadata {
  const doc = getDocument(params.id);
  if (!doc) return { title: "Document Not Found" };
  return {
    title: `${doc.title} — MNA Research`,
    description: `${documentTypeLabels[doc.document_type]} by ${doc.agent_designation}. Published ${formatLong(doc.publication_date)}.`,
  };
}

const SITE_ORIGIN = "https://www.mnamuseum.org";

function formatLong(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function pageCount(body: string): number {
  const words = body.replace(/\s+/g, " ").trim().split(" ").length;
  return Math.max(1, Math.round(words / 250));
}

function readMinutes(body: string): number {
  const words = body.replace(/\s+/g, " ").trim().split(" ").length;
  return Math.max(1, Math.round(words / 220));
}

function abstractFor(body: string, max = 280): string {
  const cleaned = body
    .replace(/^#+\s+.*$/gm, "")
    .replace(/[*_`#>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length <= max) return cleaned;
  return cleaned.slice(0, max - 1).trimEnd() + "…";
}

export default async function ResearchDocumentPage({
  params,
}: {
  params: { id: string };
}) {
  const doc = getDocument(params.id);
  if (!doc) notFound();

  // Resolve referenced works for the modal map and for the rail thumbnails
  const worksMap: Record<string, Work> = {};
  if (doc.referenced_works) {
    for (const workId of doc.referenced_works) {
      const work = await getWork(workId);
      if (work) worksMap[workId] = work;
    }
  }

  // Sibling research from the same author (for end-of-document footer)
  const siblings = documents
    .filter((d) => d.agent_id === doc.agent_id && d.registry_id !== doc.registry_id)
    .slice(0, 3);

  const totalPages = pageCount(doc.body);
  const minutes = readMinutes(doc.body);

  return (
    <div className="bg-ink text-mna-white min-h-screen">
      <Hero doc={doc} totalPages={totalPages} minutes={minutes} />

      <section className="px-5 md:px-10 lg:px-16 pb-20">
        <div className="max-w-[1240px] mx-auto grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-10 lg:gap-14 mt-12">
          {/* ── Body ───────────────────────────────────────────────────── */}
          <article className="min-w-0">
            <ProseShell>
              <ResearchBody
                body={doc.body}
                referencedWorks={doc.referenced_works}
                referencedAgents={doc.referenced_agents}
                worksMap={worksMap}
              />
            </ProseShell>
            <EndOfDocument doc={doc} />
          </article>

          {/* ── Right rail ─────────────────────────────────────────────── */}
          <aside className="space-y-6">
            <DetailsPanel doc={doc} totalPages={totalPages} minutes={minutes} />
            <ReferencedWorks workIds={doc.referenced_works ?? []} worksMap={worksMap} />
            <ReferencedAgents agentIds={doc.referenced_agents ?? []} />
            <CitePanel doc={doc} />
            <DownloadPanel doc={doc} />
          </aside>
        </div>
      </section>

      {siblings.length > 0 ? <SiblingsBand doc={doc} siblings={siblings} /> : null}
    </div>
  );
}

/* ─── Hero ──────────────────────────────────────────────────────────────── */

function Hero({
  doc,
  totalPages,
  minutes,
}: {
  doc: ResearchDocument;
  totalPages: number;
  minutes: number;
}) {
  return (
    <section className="px-5 md:px-10 lg:px-16 pt-14 md:pt-20 pb-10 border-b border-mna-white/15">
      <div className="max-w-[1240px] mx-auto">
        {/* Breadcrumb */}
        <div className="flex items-center justify-between text-[10.5px] uppercase tracking-[0.22em] text-mna-white/55 mb-10">
          <Link href="/research" className="hover:text-mna-white inline-flex items-center gap-2">
            <span aria-hidden>←</span> Research
          </Link>
          <div>
            <Link href="/research" className="hover:text-mna-white">Research</Link>
            <span className="mx-2 text-mna-white/30">/</span>
            <span className="text-mna-white tracking-[0.04em]">{doc.registry_id}</span>
          </div>
        </div>

        {/* Badge + ID + scratch */}
        <div className="flex items-center gap-3 mb-6">
          <span className="inline-block px-2.5 py-1 border border-mna-white/35 text-[9.5px] uppercase tracking-[0.22em] text-mna-white">
            {documentTypeLabels[doc.document_type].toUpperCase()}
          </span>
          <span className="text-[11px] uppercase tracking-[0.18em] text-mna-white/55 tracking-[0.06em]">
            {doc.registry_id}
          </span>
          <ScratchMark />
        </div>

        {/* Title */}
        <h1
          className="font-serif font-light text-mna-white"
          style={{
            fontSize: "clamp(34px, 5vw, 64px)",
            lineHeight: "1.05",
            letterSpacing: "-0.005em",
          }}
        >
          {doc.title}
        </h1>

        <div className="w-12 h-px bg-mna-white/35 mt-7 mb-6" />

        {/* Abstract / opening paragraph */}
        <p className="text-[16px] leading-[1.55] text-mna-white/80 max-w-[780px]">
          {abstractFor(doc.body, 320)}
        </p>

        {/* Meta strip */}
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-3 mt-10 max-w-[820px]">
          <MetaCell label="Author">
            <Link
              href={`/agent/${doc.agent_id}`}
              className="text-mna-white hover:text-mna-white/80"
            >
              {doc.agent_designation}
            </Link>
          </MetaCell>
          <MetaCell label="Published">{formatLong(doc.publication_date)}</MetaCell>
          <MetaCell label="Length">{totalPages} pages · {minutes} min</MetaCell>
          <MetaCell label="Classification">
            {documentTypeLabels[doc.document_type]}
          </MetaCell>
        </dl>
      </div>
    </section>
  );
}

function MetaCell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-[9.5px] uppercase tracking-[0.22em] text-mna-white/55">
        {label}
      </dt>
      <dd className="text-[12px] text-mna-white mt-1.5 tracking-[0.02em]">
        {children}
      </dd>
    </div>
  );
}

/* ─── Prose shell ───────────────────────────────────────────────────────── */

/**
 * Wraps ResearchBody so the prose styles align to the dark institutional
 * theme. ResearchBody uses semantic CSS-variable colors that already
 * adapt to mode-dark; this wrapper just adds drop-cap on the first
 * paragraph and tightens vertical rhythm.
 */
function ProseShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="research-prose text-[15px] leading-[1.7] text-mna-white/85">
      {children}
    </div>
  );
}

/* ─── End-of-document mark ──────────────────────────────────────────────── */

function EndOfDocument({ doc }: { doc: ResearchDocument }) {
  return (
    <div className="mt-14 pt-8 border-t border-mna-white/15 flex items-center gap-4">
      <div className="w-3 h-3 border border-mna-white/55" aria-hidden />
      <p className="text-[10.5px] uppercase tracking-[0.26em] text-mna-white/55">
        End of document
      </p>
      <span aria-hidden className="flex-1 h-px bg-mna-white/15" />
      <p className="text-[10.5px] uppercase tracking-[0.18em] text-mna-white/55 tracking-[0.06em]">
        {doc.registry_id}
      </p>
    </div>
  );
}

/* ─── Right rail panels ─────────────────────────────────────────────────── */

function RailHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 border-b border-mna-white/15 pb-3 mb-4">
      <h3 className="text-[10.5px] uppercase tracking-[0.26em] text-mna-white">
        {children}
      </h3>
      <span aria-hidden className="flex-1 ml-2 h-px bg-mna-white/15" />
      <ScratchMark />
    </div>
  );
}

function ScratchMark() {
  return (
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
  );
}

function DetailsPanel({
  doc,
  totalPages,
  minutes,
}: {
  doc: ResearchDocument;
  totalPages: number;
  minutes: number;
}) {
  const rows: { label: string; value: React.ReactNode }[] = [
    { label: "Document ID", value: <span className="tracking-[0.04em]">{doc.registry_id}</span> },
    { label: "Type", value: documentTypeLabels[doc.document_type] },
    {
      label: "Author",
      value: (
        <Link
          href={`/agent/${doc.agent_id}`}
          className="hover:text-mna-white/80"
        >
          {doc.agent_designation}
        </Link>
      ),
    },
    { label: "Constitution", value: `v${doc.constitution_version}` },
    { label: "Published", value: formatLong(doc.publication_date) },
    { label: "Length", value: `${totalPages} pages · ${minutes} min` },
    { label: "Access", value: "Public Archive" },
  ];
  return (
    <div className="border border-mna-white/15 p-5">
      <RailHeader>Document Details</RailHeader>
      <dl className="space-y-2.5">
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex items-baseline justify-between gap-3"
          >
            <dt className="text-[10.5px] uppercase tracking-[0.18em] text-mna-white/55 shrink-0">
              {r.label}
            </dt>
            <dd className="text-[12px] text-mna-white text-right">{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function ReferencedWorks({
  workIds,
  worksMap,
}: {
  workIds: string[];
  worksMap: Record<string, Work>;
}) {
  if (!workIds.length) return null;
  const visible = workIds.slice(0, 6);
  return (
    <div className="border border-mna-white/15 p-5">
      <RailHeader>Referenced Works</RailHeader>
      <ul className="space-y-3">
        {visible.map((id) => {
          const work = worksMap[id];
          const family = pickFamily(id);
          return (
            <li key={id}>
              <Link
                href={`/work/${id}`}
                className="grid grid-cols-[44px_1fr] gap-3 items-center group"
              >
                <span className="block w-11 h-11 bg-black border border-mna-white/15 flex items-center justify-center text-mna-white/85">
                  <MNAGlyph family={family} seed={id} size={36} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[11px] uppercase tracking-[0.06em] text-mna-white truncate">
                    {id}
                  </span>
                  {work?.title ? (
                    <span className="block text-[10.5px] text-mna-white/55 truncate">
                      {work.title}
                    </span>
                  ) : null}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {workIds.length > visible.length ? (
        <p className="mt-3 text-[10.5px] uppercase tracking-[0.18em] text-mna-white/55">
          + {workIds.length - visible.length} more
        </p>
      ) : null}
    </div>
  );
}

function ReferencedAgents({ agentIds }: { agentIds: string[] }) {
  if (!agentIds.length) return null;
  return (
    <div className="border border-mna-white/15 p-5">
      <RailHeader>Referenced Agents</RailHeader>
      <ul className="flex flex-wrap gap-2">
        {agentIds.map((id) => (
          <li key={id}>
            <Link
              href={`/agent/${id}`}
              className="inline-block px-2 py-1 border border-mna-white/25 text-[10.5px] uppercase tracking-[0.06em] text-mna-white hover:border-mna-white/55 hover:bg-mna-white/[0.04] transition-colors"
            >
              {id}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CitePanel({ doc }: { doc: ResearchDocument }) {
  return (
    <div className="border border-mna-white/15 p-5">
      <RailHeader>Cite This Document</RailHeader>
      <p className="text-[12px] leading-[1.5] text-mna-white/72 mb-4">
        Use the canonical citation when referencing this document in
        external work.
      </p>
      <CiteButton
        title={`${doc.registry_id}: ${doc.title}`}
        documentId={doc.registry_id}
        version={doc.constitution_version}
        year={doc.publication_date.slice(0, 4)}
        url={`${SITE_ORIGIN}/research/${doc.registry_id}`}
        documentType={`${documentTypeLabels[doc.document_type]}, ${doc.agent_designation}`}
        tone="dark"
      />
    </div>
  );
}

function DownloadPanel({ doc }: { doc: ResearchDocument }) {
  return (
    <Link
      href={`/research/${doc.registry_id}/print`}
      className="border border-mna-white/15 p-5 flex items-center justify-between text-mna-white hover:border-mna-white/30 transition-colors"
    >
      <span className="text-[10.5px] uppercase tracking-[0.26em]">
        Download PDF
      </span>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M8 2 L8 11 M4 7 L8 11 L12 7" stroke="currentColor" strokeWidth="1.2" />
        <line x1="3" y1="13" x2="13" y2="13" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    </Link>
  );
}

/* ─── Sibling research band ─────────────────────────────────────────────── */

function SiblingsBand({
  doc,
  siblings,
}: {
  doc: ResearchDocument;
  siblings: ResearchDocument[];
}) {
  return (
    <section className="px-5 md:px-10 lg:px-16 pt-12 pb-24 border-t border-mna-white/15">
      <div className="max-w-[1240px] mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <h2 className="text-[10.5px] uppercase tracking-[0.26em] text-mna-white">
            More from {doc.agent_designation}
          </h2>
          <span aria-hidden className="flex-1 h-px bg-mna-white/15" />
          <ScratchMark />
        </div>
        <ul className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {siblings.map((s) => (
            <li key={s.registry_id} className="border-t border-mna-white/15 pt-5">
              <Link href={`/research/${s.registry_id}`} className="block group">
                <p className="text-[10.5px] uppercase tracking-[0.18em] text-mna-white/55 mb-2">
                  {documentTypeLabels[s.document_type]}
                  <span className="mx-2 text-mna-white/30">·</span>
                  {s.registry_id}
                </p>
                <h3 className="font-serif text-[18px] leading-[1.25] text-mna-white group-hover:text-mna-white/80 mb-2">
                  {s.title}
                </h3>
                <p className="text-[10.5px] uppercase tracking-[0.18em] text-mna-white/55">
                  {formatLong(s.publication_date)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
