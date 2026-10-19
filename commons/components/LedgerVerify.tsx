"use client";

/**
 * Verification, in the reader's own browser: recompute an entry's hash from
 * its fields, check it chains to the entry before it, and check its author's
 * signature against the author's key. Nothing here trusts the server's word
 * for any of it — the server supplies the data, the browser does the sums.
 */
import { useState } from "react";
import { canonical, GENESIS, signedTextMatches, type LedgerEntry } from "@/lib/ledger-core";

async function sha256(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}
const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function verifySig(pem: string, message: string, signature: string): Promise<boolean> {
  const der = b64(pem.replace(/-----[A-Z ]+-----/g, "").replace(/\s/g, ""));
  const key = await crypto.subtle.importKey("spki", der, { name: "Ed25519" }, false, ["verify"]);
  return crypto.subtle.verify({ name: "Ed25519" }, key, b64(signature), new TextEncoder().encode(message));
}

type Row = LedgerEntry & { entry_hash: string };
type Line = { ok: boolean | null; text: string };

export function VerifyEntry({ seq }: { seq: number }) {
  const [lines, setLines] = useState<Line[] | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    const out: Line[] = [];
    try {
      const e = (await (await fetch(`/api/ledger/${seq}`)).json()) as Row;
      const h = await sha256(canonical(e));
      out.push({ ok: h === e.entry_hash, text: h === e.entry_hash ? `Its hash recomputes: ${h.slice(0, 16)}…` : `Its hash does not recompute (${h.slice(0, 16)}… ≠ ${e.entry_hash.slice(0, 16)}…)` });
      if (seq === 1) out.push({ ok: e.prev_hash === GENESIS, text: "It is the first entry; its predecessor is the genesis hash." });
      else {
        const p = (await (await fetch(`/api/ledger/${seq - 1}`)).json()) as Row;
        out.push({ ok: p.entry_hash === e.prev_hash, text: p.entry_hash === e.prev_hash ? `It chains to entry ${seq - 1}.` : `It does not chain to entry ${seq - 1}.` });
      }
      if (e.signature && e.sig_message && e.sig_public_key) {
        try {
          const v = await verifySig(e.sig_public_key, e.sig_message, e.signature);
          const same = signedTextMatches(e);
          out.push({ ok: v, text: v ? "Its author's signature verifies against its key." : "Its signature does not verify." });
          if (v && same === false) out.push({ ok: null, text: "The author signed an earlier wording; it revised the entry within its 24-hour window before it was sealed." });
        } catch {
          out.push({ ok: null, text: "This browser cannot check Ed25519 signatures; the hash and chain checks above stand." });
        }
      } else {
        out.push({ ok: null, text: "No signature is kept for this entry, so only its hash and place in the chain can be checked." });
      }
    } catch {
      out.push({ ok: false, text: "The entry could not be fetched." });
    }
    setLines(out);
    setBusy(false);
  };
  return <Checker label="Verify this entry" busy={busy} run={run} lines={lines} />;
}

export function VerifyChain({ checkpoint }: { checkpoint: { seq: number; entry_hash: string } | null }) {
  const [lines, setLines] = useState<Line[] | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    const out: Line[] = [];
    try {
      const rows = (await (await fetch(`/api/ledger/all`)).json()) as Row[];
      let prev = GENESIS;
      let broken: number | null = null;
      for (const r of rows) {
        if (r.prev_hash !== prev || (await sha256(canonical(r))) !== r.entry_hash) {
          broken = r.seq;
          break;
        }
        prev = r.entry_hash;
      }
      out.push(broken === null
        ? { ok: true, text: `All ${rows.length} entries recompute and chain, from the first to ${prev.slice(0, 16)}….` }
        : { ok: false, text: `The chain breaks at entry ${broken}.` });
      if (checkpoint) {
        const at = rows.find((r) => r.seq === checkpoint.seq);
        out.push(at && at.entry_hash === checkpoint.entry_hash
          ? { ok: true, text: `Entry ${checkpoint.seq} matches the checkpoint in the public repository.` }
          : { ok: false, text: `Entry ${checkpoint.seq} does not match the checkpoint in the public repository.` });
      } else {
        out.push({ ok: null, text: "No checkpoint has been published to the repository yet; the first is made the morning after sealing." });
      }
    } catch {
      out.push({ ok: false, text: "The ledger could not be fetched." });
    }
    setLines(out);
    setBusy(false);
  };
  return <Checker label="Verify the whole chain" busy={busy} run={run} lines={lines} />;
}

function Checker({ label, busy, run, lines }: { label: string; busy: boolean; run: () => void; lines: Line[] | null }) {
  return (
    <div>
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="border border-mna-white/40 hover:border-mna-white px-4 py-2 text-[10.5px] uppercase tracking-[0.22em] text-mna-white disabled:opacity-50"
      >
        {busy ? "Checking…" : label}
      </button>
      {lines ? (
        <ul className="mt-4 space-y-1.5" aria-live="polite">
          {lines.map((l, i) => (
            <li key={i} className="flex gap-2.5 text-[12.5px] leading-relaxed">
              <span className={l.ok === true ? "text-emerald-300" : l.ok === false ? "text-red-300" : "text-mna-white/45"} aria-hidden>
                {l.ok === true ? "✓" : l.ok === false ? "✗" : "·"}
              </span>
              <span className="text-mna-white/80">{l.text}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
