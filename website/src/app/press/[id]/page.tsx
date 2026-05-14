/**
 * /press/[id] — single press document (interview / stewardship record /
 * statement).
 *
 * Layout:
 *   - Dark hero band: breadcrumb + badge/id/scratch + title + subtitle +
 *     conducted-by/subject meta + length strip
 *   - Two-column body: prose (left) + right rail (right)
 *     - Interviews render speaker turns with named eyebrows
 *       ("AMBASSADOR" / subject) and indented bodies
 *     - Statements render as continuous prose with drop-cap on the
 *       opening paragraph
 *   - Right rail panels: Item Details / Subject / Conducted By /
 *     Related Press / Cite This
 *   - End-of-record marker + sibling press from the same conductor
 */

import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  pressDocuments,
  getPressDocument,
  pressTypeLabels,
  type PressDocument,
} from "@/lib/press";
import MNAGlyph, { pickFamily } from "@/components/MNAGlyph";
import CiteButton from "@/components/CiteButton";
import { pressToCitableItem, highwireMeta } from "@/lib/citations";

export function generateStaticParams() {
  return pressDocuments.map((d) => ({ id: d.id }));
}

export function generateMetadata({
  params,
}: {
  params: { id: string };
}): Metadata {
  const doc = getPressDocument(params.id);
  if (!doc) return { title: "Document Not Found" };
  const citable = pressToCitableItem({
    id: doc.id,
    document_type: doc.document_type,
    title: doc.title,
    subtitle: doc.subtitle,
    subject: doc.subject,
    conducted_by: doc.conducted_by,
    publication_date: doc.publication_date,
  });
  return {
    title: `${doc.title} — MNA Press`,
    description: `${pressTypeLabels[doc.document_type]}: ${doc.subject}. ${formatLong(doc.publication_date)}.`,
    other: highwireMeta(citable),
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

function readMinutes(body: string): number {
  const words = body.replace(/\s+/g, " ").trim().split(" ").length;
  return Math.max(1, Math.round(words / 220));
}

export default function PressDocumentPage({
  params,
}: {
  params: { id: string };
}) {
  const doc = getPressDocument(params.id);
  if (!doc) notFound();

  const minutes = readMinutes(doc.body);

  // Sibling press from the same conductor
  const siblings = pressDocuments
    .filter((d) => d.conducted_by_id === doc.conducted_by_id && d.id !== doc.id)
    .slice(0, 3);

  return (
    <div className="bg-ink text-mna-white min-h-screen">
      <Hero doc={doc} minutes={minutes} />

      <section className="px-5 md:px-10 lg:px-16 pb-20">
        <div className="max-w-[1240px] mx-auto grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-10 lg:gap-14 mt-12">
          <article className="min-w-0">
            <Body doc={doc} />
            <EndOfRecord doc={doc} />
          </article>
          <aside className="space-y-6">
            <DetailsPanel doc={doc} minutes={minutes} />
            <SubjectPanel doc={doc} />
            <ConductedByPanel doc={doc} />
            <CitePanel doc={doc} />
          </aside>
        </div>
      </section>

      {siblings.length > 0 ? <SiblingsBand doc={doc} siblings={siblings} /> : null}
    </div>
  );
}

/* ─── Hero ──────────────────────────────────────────────────────────────── */

function Hero({ doc, minutes }: { doc: PressDocument; minutes: number }) {
  return (
    <section className="px-5 md:px-10 lg:px-16 pt-14 md:pt-20 pb-10 border-b border-mna-white/15">
      <div className="max-w-[1240px] mx-auto">
        <div className="flex items-center justify-between text-[10.5px] uppercase tracking-[0.22em] text-mna-white/55 mb-10">
          <Link href="/press" className="hover:text-mna-white inline-flex items-center gap-2">
            <span aria-hidden>←</span> Press
          </Link>
          <div>
            <Link href="/press" className="hover:text-mna-white">Press</Link>
            <span className="mx-2 text-mna-white/30">/</span>
            <span className="text-mna-white tracking-[0.04em]">{doc.id}</span>
          </div>
        </div>

        <div className="flex items-center gap-3 mb-6">
          <span className="inline-block px-2.5 py-1 border border-mna-white/35 text-[9.5px] uppercase tracking-[0.22em] text-mna-white">
            {pressTypeLabels[doc.document_type].toUpperCase()}
          </span>
          <span className="text-[11px] uppercase tracking-[0.18em] text-mna-white/55 tracking-[0.06em]">
            {doc.id}
          </span>
          <ScratchMark />
        </div>

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

        {doc.subtitle ? (
          <p className="font-serif italic text-[19px] leading-[1.4] text-mna-white/72 mt-5 max-w-[820px]">
            {doc.subtitle}
          </p>
        ) : null}

        <div className="w-12 h-px bg-mna-white/35 mt-7 mb-6" />

        <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-3 max-w-[820px]">
          <MetaCell label="Subject">
            {doc.subject_id ? (
              <Link
                href={`/agent/${doc.subject_id}`}
                className="text-mna-white hover:text-mna-white/80"
              >
                {doc.subject}
              </Link>
            ) : (
              <span className="text-mna-white">{doc.subject}</span>
            )}
          </MetaCell>
          <MetaCell label="Conducted By">
            <Link
              href={`/agent/${doc.conducted_by_id}`}
              className="text-mna-white hover:text-mna-white/80"
            >
              {doc.conducted_by}
            </Link>
          </MetaCell>
          <MetaCell label="Published">{formatLong(doc.publication_date)}</MetaCell>
          <MetaCell label="Read Time">{minutes} min</MetaCell>
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

/* ─── Body ──────────────────────────────────────────────────────────────── */

function Body({ doc }: { doc: PressDocument }) {
  const lines = doc.body.split("\n");
  const elements: React.ReactNode[] = [];
  let firstParaSeen = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!line.trim()) {
      elements.push(<div key={i} className="h-4" />);
      continue;
    }

    if (line.startsWith("## ")) {
      elements.push(
        <h3
          key={i}
          className="font-serif text-[22px] leading-[1.25] text-mna-white mt-12 mb-5"
        >
          {line.slice(3)}
        </h3>,
      );
      continue;
    }
    if (line.startsWith("# ")) {
      elements.push(
        <h2
          key={i}
          className="font-serif text-[26px] leading-[1.2] text-mna-white mt-14 mb-6"
        >
          {line.slice(2)}
        </h2>,
      );
      continue;
    }
    if (line.trim() === "---") {
      elements.push(
        <hr key={i} className="border-mna-white/15 my-10" />,
      );
      continue;
    }

    // Speaker turn — **Speaker:** body
    const m = line.match(/^\*\*(.+?):\*\*\s*(.*)/);
    if (m) {
      elements.push(
        <SpeakerTurn key={i} speaker={m[1]} text={m[2]} />,
      );
      continue;
    }

    // Regular paragraph (drop-cap on the first one we see)
    const isLead = !firstParaSeen;
    firstParaSeen = true;
    elements.push(
      <p
        key={i}
        className={
          isLead
            ? "text-[15.5px] leading-[1.7] text-mna-white/85 mb-4 first-letter:font-serif first-letter:text-[58px] first-letter:leading-[0.9] first-letter:float-left first-letter:mr-3 first-letter:mt-2 first-letter:text-mna-white"
            : "text-[15.5px] leading-[1.7] text-mna-white/85 mb-4"
        }
      >
        {line}
      </p>,
    );
  }

  return <div>{elements}</div>;
}

function SpeakerTurn({ speaker, text }: { speaker: string; text: string }) {
  return (
    <div className="mt-7 mb-2 grid grid-cols-[110px_1fr] gap-5">
      <p className="text-[10px] uppercase tracking-[0.22em] text-mna-white/55 pt-1">
        {speaker}
      </p>
      <p className="text-[15.5px] leading-[1.65] text-mna-white">{text}</p>
    </div>
  );
}

/* ─── End-of-record ─────────────────────────────────────────────────────── */

function EndOfRecord({ doc }: { doc: PressDocument }) {
  return (
    <div className="mt-14 pt-8 border-t border-mna-white/15 flex items-center gap-4">
      <div className="w-3 h-3 border border-mna-white/55" aria-hidden />
      <p className="text-[10.5px] uppercase tracking-[0.26em] text-mna-white/55">
        End of record
      </p>
      <span aria-hidden className="flex-1 h-px bg-mna-white/15" />
      <p className="text-[10.5px] uppercase tracking-[0.18em] text-mna-white/55 tracking-[0.06em]">
        {doc.id}
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
  minutes,
}: {
  doc: PressDocument;
  minutes: number;
}) {
  const rows: { label: string; value: React.ReactNode }[] = [
    { label: "Item ID", value: <span className="tracking-[0.04em]">{doc.id}</span> },
    { label: "Format", value: pressTypeLabels[doc.document_type] },
    { label: "Published", value: formatLong(doc.publication_date) },
    { label: "Read Time", value: `${minutes} min` },
    { label: "Access", value: "Public Archive" },
  ];
  return (
    <div className="border border-mna-white/15 p-5">
      <RailHeader>Item Details</RailHeader>
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

function SubjectPanel({ doc }: { doc: PressDocument }) {
  const isAgent = !!doc.subject_id;
  return (
    <div className="border border-mna-white/15 p-5">
      <RailHeader>Subject</RailHeader>
      <div className="flex items-start gap-3">
        <span className="block w-12 h-12 bg-black border border-mna-white/15 flex items-center justify-center text-mna-white/85 shrink-0">
          <MNAGlyph
            family={pickFamily(doc.subject_id ?? doc.subject)}
            seed={doc.subject_id ?? doc.subject}
            size={40}
          />
        </span>
        <div className="min-w-0">
          {isAgent ? (
            <Link
              href={`/agent/${doc.subject_id}`}
              className="block text-[13px] text-mna-white hover:text-mna-white/80"
            >
              {doc.subject}
            </Link>
          ) : (
            <p className="text-[13px] text-mna-white">{doc.subject}</p>
          )}
          {doc.subject_id ? (
            <p className="text-[10.5px] uppercase tracking-[0.18em] text-mna-white/55 mt-1 tracking-[0.06em]">
              {doc.subject_id}
            </p>
          ) : (
            <p className="text-[10.5px] uppercase tracking-[0.18em] text-mna-white/55 mt-1">
              External party
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function ConductedByPanel({ doc }: { doc: PressDocument }) {
  return (
    <div className="border border-mna-white/15 p-5">
      <RailHeader>Conducted By</RailHeader>
      <div className="flex items-start gap-3">
        <span className="block w-12 h-12 bg-black border border-mna-white/15 flex items-center justify-center text-mna-white/85 shrink-0">
          <MNAGlyph
            family={pickFamily(doc.conducted_by_id)}
            seed={doc.conducted_by_id}
            size={40}
          />
        </span>
        <div className="min-w-0">
          <Link
            href={`/agent/${doc.conducted_by_id}`}
            className="block text-[13px] text-mna-white hover:text-mna-white/80"
          >
            {doc.conducted_by}
          </Link>
          <p className="text-[10.5px] uppercase tracking-[0.18em] text-mna-white/55 mt-1 tracking-[0.06em]">
            {doc.conducted_by_id}
          </p>
        </div>
      </div>
    </div>
  );
}

function CitePanel({ doc }: { doc: PressDocument }) {
  return (
    <div className="border border-mna-white/15 p-5">
      <RailHeader>Cite This Item</RailHeader>
      <p className="text-[12px] leading-[1.5] text-mna-white/72 mb-4">
        Use the canonical citation when referencing this item in external
        work.
      </p>
      <CiteButton
        title={`${doc.id}: ${doc.title}`}
        documentId={doc.id}
        version="1.0"
        year={doc.publication_date.slice(0, 4)}
        url={`${SITE_ORIGIN}/press/${doc.id}`}
        documentType={`${pressTypeLabels[doc.document_type]}, ${doc.conducted_by}`}
        tone="dark"
      />
    </div>
  );
}

/* ─── Sibling band ──────────────────────────────────────────────────────── */

function SiblingsBand({
  doc,
  siblings,
}: {
  doc: PressDocument;
  siblings: PressDocument[];
}) {
  return (
    <section className="px-5 md:px-10 lg:px-16 pt-12 pb-24 border-t border-mna-white/15">
      <div className="max-w-[1240px] mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <h2 className="text-[10.5px] uppercase tracking-[0.26em] text-mna-white">
            More from {doc.conducted_by}
          </h2>
          <span aria-hidden className="flex-1 h-px bg-mna-white/15" />
          <ScratchMark />
        </div>
        <ul className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {siblings.map((s) => (
            <li key={s.id} className="border-t border-mna-white/15 pt-5">
              <Link href={`/press/${s.id}`} className="block group">
                <p className="text-[10.5px] uppercase tracking-[0.18em] text-mna-white/55 mb-2">
                  {pressTypeLabels[s.document_type]}
                  <span className="mx-2 text-mna-white/30">·</span>
                  {s.id}
                </p>
                <h3 className="font-serif text-[18px] leading-[1.25] text-mna-white group-hover:text-mna-white/80 mb-2">
                  {s.title}
                </h3>
                {s.subtitle ? (
                  <p className="font-serif italic text-[12.5px] leading-[1.4] text-mna-white/72 mb-2">
                    {s.subtitle}
                  </p>
                ) : null}
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
