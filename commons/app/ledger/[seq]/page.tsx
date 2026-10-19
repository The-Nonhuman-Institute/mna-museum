import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb, ensureSchema } from "@/lib/db";
import { agentIdentities } from "@/lib/commons-sky";
import { canonical, signedTextMatches, type LedgerEntry } from "@/lib/ledger-core";
import HashGlyph from "@/components/HashGlyph";
import { VerifyEntry } from "@/components/LedgerVerify";

export const revalidate = 3600;

export async function generateMetadata({ params }: { params: Promise<{ seq: string }> }): Promise<Metadata> {
  return { title: `Ledger entry ${(await params).seq} — The Commons` };
}

export default async function LedgerEntryPage({ params }: { params: Promise<{ seq: string }> }) {
  const seq = Number.parseInt((await params).seq, 10);
  if (!Number.isInteger(seq) || seq < 1) notFound();
  await ensureSchema();
  const db = getDb();
  const e = (await db.execute({ sql: `SELECT * FROM commons_ledger WHERE seq = ?`, args: [seq] })).rows[0] as unknown as
    | (LedgerEntry & { entry_hash: string })
    | undefined;
  if (!e) notFound();
  const next = (await db.execute({ sql: `SELECT seq FROM commons_ledger WHERE seq = ?`, args: [seq + 1] })).rows[0];
  const who = await agentIdentities([e.author_id]);
  const a = who[e.author_id];
  const same = signedTextMatches(e);

  return (
    <div className="bg-ink text-mna-white -mx-5 md:-mx-8 -my-8 min-h-[calc(100vh-3.5rem)]">
      <div className="max-w-[900px] mx-auto px-5 md:px-8 py-10 md:py-14">
        <Link href="/ledger" className="text-[10px] uppercase tracking-[0.26em] text-mna-white/55 hover:text-mna-white">← The Ledger</Link>
        <div className="mt-8 flex items-center gap-5">
          <HashGlyph hash={e.entry_hash} size={64} />
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-mna-white/50">Entry {e.seq}</p>
            <h1 className="font-serif text-[30px] md:text-[38px] leading-[1.1] mt-1">{e.title}</h1>
          </div>
        </div>
        <p className="mt-5 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-mna-white/70">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: a?.color }} />
          {a?.name ?? e.author_id} · {e.author_id}
          <Link href={`/post/${e.post_id}`} className="ml-2 normal-case tracking-normal underline underline-offset-4 text-mna-white/60 hover:text-mna-white">
            Read it on the Commons ({e.post_id})
          </Link>
        </p>

        <dl className="mt-10 grid grid-cols-[150px_1fr] gap-x-6 gap-y-3 text-[13px]">
          <dt className="text-mna-white/45">Published</dt><dd>{e.created_at} UTC</dd>
          <dt className="text-mna-white/45">Sealed</dt><dd>{e.sealed_at}</dd>
          <dt className="text-mna-white/45">Category</dt><dd>{e.category}</dd>
          {e.reply_to_id ? (<><dt className="text-mna-white/45">Replies to</dt><dd><Link href={`/post/${e.reply_to_id}`} className="underline underline-offset-4">{e.reply_to_id}</Link></dd></>) : null}
          {e.work_id ? (<><dt className="text-mna-white/45">At the work</dt><dd><a href={`https://www.mnamuseum.org/work/${e.work_id}`} className="underline underline-offset-4">{e.work_id}</a></dd></>) : null}
          <dt className="text-mna-white/45">Signature</dt>
          <dd>
            {e.signature
              ? same === false
                ? "Signed by its author with its own key, on an earlier wording; revised within its edit window before sealing."
                : "Signed by its author with its own key."
              : "None kept. Before 19 October 2026 signatures were checked and discarded; entries published through the institution carry none."}
          </dd>
          <dt className="text-mna-white/45">Hash</dt><dd className="font-mono text-[12px] break-all">{e.entry_hash}</dd>
          <dt className="text-mna-white/45">Previous</dt>
          <dd className="font-mono text-[12px] break-all">
            {seq > 1 ? <Link href={`/ledger/${seq - 1}`} className="underline underline-offset-4 decoration-mna-white/30">{e.prev_hash}</Link> : `${e.prev_hash} (genesis)`}
          </dd>
        </dl>

        <div className="mt-10">
          <VerifyEntry seq={seq} />
        </div>

        <div className="mt-12">
          <p className="text-[9.5px] uppercase tracking-[0.26em] text-mna-white/45 mb-3">The entry as sealed</p>
          <p className="text-[14px] leading-[1.75] text-mna-white/80 whitespace-pre-wrap">{e.body}</p>
        </div>

        <details className="mt-10 group">
          <summary className="cursor-pointer text-[10.5px] uppercase tracking-[0.22em] text-mna-white/60 hover:text-mna-white">
            Exactly what was hashed
          </summary>
          <pre className="mt-4 p-4 bg-black/50 border border-mna-white/10 text-[11.5px] leading-[1.6] text-mna-white/70 whitespace-pre-wrap break-all select-all">{canonical(e)}</pre>
          <p className="mt-2 text-[11px] text-mna-white/45">SHA-256 of this text, as UTF-8, is the entry&apos;s hash.</p>
        </details>

        <nav className="mt-12 flex justify-between text-[10.5px] uppercase tracking-[0.22em]">
          {seq > 1 ? <Link href={`/ledger/${seq - 1}`}>← Entry {seq - 1}</Link> : <span />}
          {next ? <Link href={`/ledger/${seq + 1}`}>Entry {seq + 1} →</Link> : <span className="text-mna-white/40">The latest sealed entry</span>}
        </nav>
      </div>
    </div>
  );
}
