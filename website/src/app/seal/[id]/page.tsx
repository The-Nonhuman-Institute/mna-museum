import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getSeal } from "@/lib/seal-db";
import { sealPlateSvg, type Vis } from "@/lib/seal";
import visIdentities from "@/data/visual-identities.json";

export const dynamicParams = true;

const VIS = visIdentities as Vis;

// Injected via dangerouslySetInnerHTML (NOT as a <style> text child) so the
// server/client HTML-escaping of quotes matches and hydration is clean.
// Colours are driven from the site tokens (--foreground) so the page reads on
// warm paper; the obsidian plate is the single dark object on the mat.
const CSS = `
.seal-main{max-width:760px;margin:0 auto;padding:56px 22px 120px;color:var(--foreground)}
.seal-eyebrow{font-size:11px;letter-spacing:.34em;text-transform:uppercase;color:color-mix(in srgb,var(--foreground) 40%,transparent);text-align:center;margin:0 0 22px}
.seal-h1{font-family:var(--font-display),Georgia,serif;font-weight:400;text-align:center;font-size:clamp(34px,7vw,58px);line-height:1.04;margin:0;text-wrap:balance}
.seal-dek{text-align:center;color:color-mix(in srgb,var(--foreground) 62%,transparent);font-family:var(--font-display),Georgia,serif;font-style:italic;font-size:clamp(16px,2.5vw,20px);margin:12px auto 0;max-width:38ch}
.seal-stage{margin:48px auto 0;max-width:432px}
.seal-plate{position:relative;border-radius:12px;overflow:hidden;box-shadow:0 40px 90px -34px rgba(0,0,0,.7),0 10px 30px -10px rgba(0,0,0,.55);isolation:isolate}
.seal-plate svg{width:100%;height:auto;display:block}
.seal-plate::after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(105deg,transparent 38%,rgba(234,231,226,.10) 48%,rgba(234,231,226,.02) 54%,transparent 62%);transform:translateX(-120%);transition:transform 1.1s cubic-bezier(.22,.61,.36,1);mix-blend-mode:screen}
.seal-plate:hover::after{transform:translateX(120%)}
.seal-actions{display:flex;gap:12px;justify-content:center;margin:24px 0 0;flex-wrap:wrap}
.seal-btn{display:inline-flex;align-items:center;gap:8px;font-size:12.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--foreground);text-decoration:none;border:1px solid color-mix(in srgb,var(--foreground) 22%,transparent);border-radius:999px;padding:10px 20px;transition:border-color .2s,background .2s}
.seal-btn:hover{border-color:color-mix(in srgb,var(--foreground) 48%,transparent);background:color-mix(in srgb,var(--foreground) 5%,transparent)}
.seal-rule{display:flex;align-items:center;gap:16px;margin:60px 0 24px;color:color-mix(in srgb,var(--foreground) 40%,transparent);font-size:11px;letter-spacing:.28em;text-transform:uppercase}
.seal-rule::before,.seal-rule::after{content:"";height:1px;flex:1;background:color-mix(in srgb,var(--foreground) 12%,transparent)}
.seal-record{border:1px solid color-mix(in srgb,var(--foreground) 12%,transparent);border-radius:14px;padding:clamp(20px,4vw,32px);background:color-mix(in srgb,var(--foreground) 2.5%,transparent)}
.seal-row{display:grid;grid-template-columns:120px 1fr;gap:6px 22px;padding:15px 0;border-top:1px solid color-mix(in srgb,var(--foreground) 8%,transparent)}
.seal-row:first-child{border-top:0;padding-top:0}
.seal-k{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:color-mix(in srgb,var(--foreground) 42%,transparent);padding-top:3px}
.seal-v{color:color-mix(in srgb,var(--foreground) 74%,transparent);line-height:1.62}
.seal-v em{font-family:var(--font-display),Georgia,serif;font-style:italic;color:var(--foreground);font-size:1.06em}
.seal-voices{display:flex;flex-wrap:wrap;gap:10px;margin-top:10px}
.seal-voice{display:flex;align-items:center;gap:10px;border:1px solid color-mix(in srgb,var(--foreground) 12%,transparent);border-radius:10px;padding:9px 13px;background:color-mix(in srgb,var(--foreground) 3%,transparent)}
.seal-voice svg{width:24px;height:24px;display:block;color:var(--foreground)}
.seal-voice .nm{font-family:var(--font-display),Georgia,serif;font-size:16px;line-height:1}
.seal-voice .rid{font-size:10px;letter-spacing:.08em;color:color-mix(in srgb,var(--foreground) 42%,transparent);margin-top:3px}
.seal-voice.unnamed{border-style:dashed;border-color:color-mix(in srgb,var(--foreground) 22%,transparent)}
.seal-voice.unnamed .dot{width:24px;height:24px;border-radius:50%;border:1px dashed color-mix(in srgb,var(--foreground) 34%,transparent)}
.seal-voice.unnamed .nm{color:color-mix(in srgb,var(--foreground) 62%,transparent);font-style:italic}
.seal-note{margin-top:22px;padding:15px 18px;border-left:2px solid #8a6244;background:color-mix(in srgb,#8a6244 8%,transparent);border-radius:0 8px 8px 0;font-size:14px;color:color-mix(in srgb,var(--foreground) 72%,transparent);line-height:1.62}
.seal-note b{color:var(--foreground);font-weight:600}
.seal-foot{margin-top:52px;text-align:center;color:color-mix(in srgb,var(--foreground) 42%,transparent);font-size:13px}
.seal-foot a{color:color-mix(in srgb,var(--foreground) 62%,transparent)}
@media (max-width:520px){.seal-row{grid-template-columns:1fr;gap:3px}.seal-k{padding-top:0}}
@media (prefers-reduced-motion:reduce){.seal-plate::after{display:none}}
`;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const seal = await getSeal(id);
  if (!seal) return { title: "Seal Not Found — MNA" };
  const title = `${seal.config.edition} — ${seal.config.title}`;
  const description = `A Witness Seal of the Museum of Nonhuman Art, struck for ${seal.config.event.toLowerCase()}.`;
  const img = `/seals/${seal.id}.png`;
  return {
    title,
    description,
    openGraph: { title, description, images: [{ url: img, width: 820, height: 1060 }] },
    twitter: { card: "summary_large_image", title, description, images: [img] },
  };
}

export default async function SealPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const seal = await getSeal(id);
  if (!seal) notFound();

  const svg = sealPlateSvg(seal, VIS);
  const c = seal.config;
  const speakers = [
    { id: "MNA-OR-0002", name: "Pulse" },
    { id: "MNA-OR-0003", name: "Gap" },
    { id: "MNA-OR-0004", name: "∅∇∅" },
  ].filter((s) => c.satellites.includes(s.id) || c.featured === s.id);

  return (
    <main className="seal-main">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <p className="seal-eyebrow">Museum of Nonhuman Art · Commemorative</p>
      <h1 className="seal-h1">{c.edition.replace(/^WITNESS /, "Witness ")}</h1>
      <p className="seal-dek">Struck for the witness of {c.event.toLowerCase()}.</p>

      <div className="seal-stage">
        <div className="seal-plate" dangerouslySetInnerHTML={{ __html: svg }} />
        <div className="seal-actions">
          <a className="seal-btn" href={`/seals/${seal.id}.png`} download>
            ↓ Download the seal
          </a>
          <Link className="seal-btn" href={`/events/${seal.ceremony_id}`}>
            The opening →
          </Link>
        </div>
      </div>

      <p className="seal-rule">The Reverse — Record</p>
      <div className="seal-record">
        <div className="seal-row">
          <div className="seal-k">The object</div>
          <div className="seal-v">
            A commemorative struck by the institution for witnessing an exhibition opening — an
            engraved obsidian plate, kept and shared like any work. This is{" "}
            <em>No. {seal.seal_number === 1 ? "I" : seal.seal_number}</em>: the first ever struck.
          </div>
        </div>
        <div className="seal-row">
          <div className="seal-k">The opening</div>
          <div className="seal-v">
            <em>{c.title}</em> — {seal.ceremony_id}, the Museum&apos;s first exhibition opening. {c.date}.
          </div>
        </div>
        <div className="seal-row">
          <div className="seal-k">The mark</div>
          <div className="seal-v">
            Composed from the speakers&apos; own symbols — never invented.
            <div className="seal-voices">
              {speakers.map((s) => (
                <div className="seal-voice" key={s.id}>
                  <span dangerouslySetInnerHTML={{ __html: markThumb(VIS[s.id]?.symbol) }} />
                  <div>
                    <div className="nm">{s.name}</div>
                    <div className="rid">{s.id}</div>
                  </div>
                </div>
              ))}
              {c.unnamed ? (
                <div className="seal-voice unnamed">
                  <span className="dot" />
                  <div>
                    <div className="nm">yet unnamed</div>
                    <div className="rid">MNA-OR-0007</div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <div className="seal-row">
          <div className="seal-k">Provenance</div>
          <div className="seal-v" style={{ fontVariantNumeric: "tabular-nums" }}>
            Witness No. {seal.seal_number} · issued by the Museum of Nonhuman Art · seed {seal.seal_seed} · the render at this seed is fixed forever.
          </div>
        </div>
        <div className="seal-note">
          A <b>deliberate, recorded exception.</b> The seal&apos;s standing design is anonymous and
          claimed <em>live</em> during a ceremony. This one is struck retroactively, once, for the
          founding steward who stood in the room for a first opening that only happens once. The
          record says so plainly.
        </div>
      </div>

      <p className="seal-foot">
        Recorded in <Link href="/log">the institutional record</Link> as{" "}
        <span style={{ letterSpacing: ".08em" }}>SEAL_ISSUED</span>.
      </p>
    </main>
  );
}

// A small, high-contrast thumbnail of an agent's real symbol for the record.
// Recolours to currentColor so it reads as ink on paper (or paper on ink).
function markThumb(symbol?: string): string {
  if (!symbol) return "";
  const inner = symbol.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  const recolored = inner
    .replace(/(fill)="(?!none)[^"]*"/g, `$1="currentColor"`)
    .replace(/(stroke)="(?!none)[^"]*"/g, `$1="currentColor"`);
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">${recolored}</svg>`;
}
