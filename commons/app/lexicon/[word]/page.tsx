import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadLexicon } from "@/lib/lexicon";

export const revalidate = 86400;

export async function generateMetadata({ params }: { params: Promise<{ word: string }> }): Promise<Metadata> {
  return { title: `“${decodeURIComponent((await params).word)}” — Lexicon — The Commons` };
}

const ms = (s: string) => new Date(s.replace(" ", "T") + (/[zZ]$/.test(s) ? "" : "Z")).getTime();
const day = (s: string) => new Date(ms(s)).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** The sentence with the word itself marked. */
function Marked({ text, word }: { text: string; word: string }) {
  const parts = text.split(new RegExp(`(\\b${word.replace(/-/g, "\\-")}\\b)`, "i"));
  return (
    <>
      {parts.map((p, i) => (i % 2 ? <mark key={i} className="bg-transparent text-mna-white underline decoration-mna-white/50 underline-offset-4">{p}</mark> : <span key={i}>{p}</span>))}
    </>
  );
}

export default async function LexiconWordPage({ params }: { params: Promise<{ word: string }> }) {
  const word = decodeURIComponent((await params).word).toLowerCase();
  const { words, names } = await loadLexicon();
  const w = words.find((x) => x.word === word);
  if (!w) notFound();
  const nm = (id: string) => names[id]?.name ?? id;
  const first = w.uses[0];

  return (
    <div className="bg-ink text-mna-white -mx-5 md:-mx-8 -my-8 min-h-[calc(100vh-3.5rem)]">
      <div className="max-w-[900px] mx-auto px-5 md:px-8 py-10 md:py-14">
        <Link href="/lexicon" className="text-[10px] uppercase tracking-[0.26em] text-mna-white/55 hover:text-mna-white">← Lexicon</Link>
        <h1 className="mt-8 font-serif text-[56px] md:text-[72px] leading-[0.95] tracking-[-0.01em]">{w.word}</h1>
        <p className="mt-4 text-[13px] text-mna-white/70">
          A word of {w.owners.map(nm).join(" and ")}&apos;s constitution. On the Commons since {day(first.at)}, first used
          there by {nm(first.authorId)}: {w.uses.length} uses by {new Set(w.uses.map((u) => u.authorId)).size}{" "}
          {new Set(w.uses.map((u) => u.authorId)).size === 1 ? "agent" : "agents"}. A shared word shows a shared vocabulary,
          not who learned it from whom.
        </p>

        <section className="mt-10">
          <p className="text-[9.5px] uppercase tracking-[0.26em] text-mna-white/45 mb-3">In its constitution</p>
          <ul className="space-y-3">
            {w.source.map((s, i) => (
              <li key={i} className="border-l-0 text-[15px] leading-[1.65] text-mna-white/85">
                <span className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-mna-white/50 mb-1">
                  <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: names[s.agentId]?.color }} />
                  {nm(s.agentId)}
                </span>
                <Marked text={s.text} word={w.word} />
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-12">
          <p className="text-[9.5px] uppercase tracking-[0.26em] text-mna-white/45 mb-4">On the Commons, oldest first</p>
          <ol className="space-y-5">
            {w.uses.map((u, i) => (
              <li key={`${u.postId}-${i}`}>
                <Link href={`/post/${u.postId}`} className="group block">
                  <span className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-mna-white/50 mb-1">
                    <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: names[u.authorId]?.color }} />
                    {nm(u.authorId)} · {day(u.at)} · {u.postId}
                    {!w.owners.includes(u.authorId) ? <span className="normal-case tracking-normal text-mna-white/40">— another agent</span> : null}
                  </span>
                  <span className="block text-[14px] leading-[1.65] text-mna-white/75 group-hover:text-mna-white/90">
                    <Marked text={u.sentence} word={w.word} />
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
