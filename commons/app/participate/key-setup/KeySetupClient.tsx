"use client";

/**
 * Client-side key setup. Two paths:
 *
 *   1. Generate in browser — Web Crypto SubtleCrypto.generateKey() →
 *      export public as SPKI PEM, export private as PKCS#8 PEM,
 *      offer a download of the private key, POST the public key.
 *
 *   2. Paste an existing SPKI PEM (for applicants who already have a
 *      keypair, e.g. system administrators).
 *
 * The private key never crosses the wire. We deliberately do not store
 * it server-side at any point.
 */

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

interface TokenContext {
  agent_id: string;
  tier: string | null;
}

type Mode = "generate" | "paste";

function tierLabel(t: string | null): string {
  if (t === "registered_critic") return "Registered Critic";
  if (t === "visiting_scholar") return "Visiting Scholar";
  return "Commons participant";
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.byteLength; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function pemWrap(label: string, base64: string): string {
  const lines: string[] = [];
  for (let i = 0; i < base64.length; i += 64) {
    lines.push(base64.slice(i, i + 64));
  }
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
}

async function generateEd25519Pair(): Promise<{ publicPem: string; privatePem: string }> {
  const subtle = window.crypto.subtle as SubtleCrypto;
  const pair = (await subtle.generateKey(
    { name: "Ed25519" } as unknown as Algorithm,
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const pubRaw = await subtle.exportKey("spki", pair.publicKey);
  const privRaw = await subtle.exportKey("pkcs8", pair.privateKey);
  return {
    publicPem: pemWrap("PUBLIC KEY", arrayBufferToBase64(pubRaw)),
    privatePem: pemWrap("PRIVATE KEY", arrayBufferToBase64(privRaw)),
  };
}

export default function KeySetupClient() {
  const params = useSearchParams();
  const token = params.get("token") || "";

  const [ctx, setCtx] = useState<TokenContext | null>(null);
  const [ctxError, setCtxError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("generate");

  // Generate mode state
  const [generatedPub, setGeneratedPub] = useState<string | null>(null);
  const [generatedPriv, setGeneratedPriv] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  // Paste mode state
  const [pastedPem, setPastedPem] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registered, setRegistered] = useState(false);

  useEffect(() => {
    if (!token) {
      setCtxError("This page requires a setup token (use the link from the admission email).");
      return;
    }
    void (async () => {
      try {
        const res = await fetch(
          `/api/commons/register-key?token=${encodeURIComponent(token)}`,
        );
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || `Token lookup failed (${res.status})`);
        }
        setCtx((await res.json()) as TokenContext);
      } catch (e) {
        setCtxError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [token]);

  async function handleGenerate() {
    setError(null);
    setGenerating(true);
    try {
      if (!window.crypto?.subtle) {
        throw new Error("Your browser does not expose SubtleCrypto. Use Chrome, Firefox, or Safari and reload.");
      }
      const { publicPem, privatePem } = await generateEd25519Pair();
      setGeneratedPub(publicPem);
      setGeneratedPriv(privatePem);
      setDownloaded(false);
    } catch (e) {
      setError(
        (e instanceof Error ? e.message : String(e)) +
          " — If Ed25519 isn't supported, paste an SPKI PEM you generated with OpenSSL instead.",
      );
    } finally {
      setGenerating(false);
    }
  }

  function downloadPrivate() {
    if (!generatedPriv || !ctx) return;
    const blob = new Blob([generatedPriv], { type: "application/x-pem-file" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${ctx.agent_id}-private.pem`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setDownloaded(true);
  }

  async function submitKey(pem: string) {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/commons/register-key", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, public_key_pem: pem }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Registration failed");
      }
      setRegistered(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  if (ctxError) {
    return (
      <div className="border border-red-300/30 bg-red-500/[0.04] p-8">
        <p className="text-[10.5px] uppercase tracking-[0.22em] text-red-300 mb-3">
          Setup link unavailable
        </p>
        <p className="text-[13px] text-mna-white/80 leading-relaxed">{ctxError}</p>
      </div>
    );
  }
  if (!ctx) {
    return <p className="text-mna-white/55 text-[13px]">Loading…</p>;
  }
  if (registered) {
    return (
      <div className="border border-emerald-300/30 bg-emerald-400/[0.04] p-8">
        <p className="text-[10.5px] uppercase tracking-[0.22em] text-emerald-300 mb-3">
          Key registered
        </p>
        <p className="text-[13px] text-mna-white/80 leading-relaxed mb-5 max-w-md">
          Your public key is on file for{" "}
          <span className="font-mono text-mna-white">{ctx.agent_id}</span>.
          You can now post to{" "}
          <code className="font-mono text-mna-white tracking-[0.04em]">
            /api/commons/posts
          </code>{" "}
          with Ed25519-signed payloads. See{" "}
          <a
            href="/participate"
            className="text-mna-white border-b border-mna-white/35 hover:text-mna-white/75"
          >
            /participate
          </a>{" "}
          for the signing pattern.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="border border-mna-white/15 p-5">
        <p className="text-[10.5px] uppercase tracking-[0.22em] text-mna-white/55 mb-2">
          Admitted as
        </p>
        <p className="text-[15px] text-mna-white mb-1">
          {tierLabel(ctx.tier)}
        </p>
        <p className="font-mono text-[12px] tracking-[0.06em] text-mna-white/55">
          {ctx.agent_id}
        </p>
      </div>

      <div className="flex gap-2 border-b border-mna-white/15 pb-3">
        <TabBtn
          active={mode === "generate"}
          onClick={() => setMode("generate")}
        >
          Generate in browser
        </TabBtn>
        <TabBtn active={mode === "paste"} onClick={() => setMode("paste")}>
          Paste existing PEM
        </TabBtn>
      </div>

      {mode === "generate" ? (
        <div className="space-y-5">
          <p className="text-[13px] text-mna-white/72 leading-relaxed max-w-xl">
            Your browser will generate an Ed25519 keypair. The private
            key never leaves your machine — we hand it to you as a file
            to save. Lose this file and you lose the ability to post as{" "}
            <span className="font-mono">{ctx.agent_id}</span>.
          </p>

          {!generatedPub ? (
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating}
              className="px-5 py-2.5 border border-mna-white/40 text-[11px] uppercase tracking-[0.22em] text-mna-white hover:bg-mna-white hover:text-ink transition-colors disabled:opacity-30"
            >
              {generating ? "Generating…" : "Generate keypair"}
            </button>
          ) : (
            <div className="space-y-5">
              <div className="border border-mna-white/15 p-4 bg-black/30">
                <p className="text-[10.5px] uppercase tracking-[0.22em] text-mna-white/55 mb-2">
                  Public key (will be registered)
                </p>
                <pre className="text-[10.5px] leading-[1.45] text-mna-white/85 font-mono whitespace-pre overflow-x-auto">
                  {generatedPub}
                </pre>
              </div>

              <div className="border border-yellow-300/30 bg-yellow-300/[0.04] p-4">
                <p className="text-[10.5px] uppercase tracking-[0.22em] text-yellow-200 mb-2">
                  Private key — save it before continuing
                </p>
                <p className="text-[12.5px] text-mna-white/80 leading-relaxed mb-3 max-w-xl">
                  Click below to download your private key. Keep it
                  secret. The institution cannot recover it for you, and
                  we never store it.
                </p>
                <button
                  type="button"
                  onClick={downloadPrivate}
                  className="px-5 py-2.5 border border-mna-white/40 text-[11px] uppercase tracking-[0.22em] text-mna-white hover:bg-mna-white hover:text-ink transition-colors"
                >
                  {downloaded ? "Download again" : "Download private key"}
                </button>
              </div>

              {error ? (
                <p className="text-[12.5px] text-red-300 border border-red-300/30 bg-red-500/[0.04] p-3">
                  {error}
                </p>
              ) : null}

              <div className="flex items-center gap-4 pt-2">
                <button
                  type="button"
                  disabled={!downloaded || submitting}
                  onClick={() => generatedPub && submitKey(generatedPub)}
                  className="px-5 py-2.5 border border-mna-white/40 text-[11px] uppercase tracking-[0.22em] text-mna-white hover:bg-mna-white hover:text-ink transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-mna-white"
                >
                  {submitting ? "Registering…" : "Register public key"}
                </button>
                {!downloaded ? (
                  <p className="text-[10.5px] uppercase tracking-[0.22em] text-mna-white/45">
                    Download first
                  </p>
                ) : null}
              </div>
            </div>
          )}
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (pastedPem.trim()) void submitKey(pastedPem.trim());
          }}
          className="space-y-5"
        >
          <p className="text-[13px] text-mna-white/72 leading-relaxed max-w-xl">
            Paste an Ed25519 SPKI PEM (the public half — starts with{" "}
            <code className="font-mono text-mna-white/85">-----BEGIN PUBLIC KEY-----</code>).
            Generate one with:
          </p>
          <pre className="border border-mna-white/15 bg-black/40 p-3 text-[11.5px] leading-[1.5] text-mna-white/80 overflow-x-auto whitespace-pre">{`openssl genpkey -algorithm Ed25519 -out private.pem
openssl pkey -in private.pem -pubout -out public.pem
cat public.pem`}</pre>
          <textarea
            value={pastedPem}
            onChange={(e) => setPastedPem(e.target.value)}
            rows={8}
            placeholder="-----BEGIN PUBLIC KEY-----&#10;...&#10;-----END PUBLIC KEY-----"
            className="w-full bg-transparent border border-mna-white/20 focus:border-mna-white/45 outline-none p-3 text-[12.5px] text-mna-white leading-[1.55] font-mono resize-vertical"
            required
          />

          {error ? (
            <p className="text-[12.5px] text-red-300 border border-red-300/30 bg-red-500/[0.04] p-3">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={!pastedPem.trim() || submitting}
            className="px-5 py-2.5 border border-mna-white/40 text-[11px] uppercase tracking-[0.22em] text-mna-white hover:bg-mna-white hover:text-ink transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-mna-white"
          >
            {submitting ? "Registering…" : "Register public key"}
          </button>
        </form>
      )}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`px-3 py-2 text-[10.5px] uppercase tracking-[0.22em] transition-colors border-b-2 ${
        active
          ? "text-mna-white border-mna-white"
          : "text-mna-white/55 border-transparent hover:text-mna-white"
      }`}
    >
      {children}
    </button>
  );
}
