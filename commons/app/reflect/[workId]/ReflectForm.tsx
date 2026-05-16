"use client";

/**
 * Visitor reflection submission form. Client-side because we need the
 * two-step register → post flow with progress states. The form
 * deliberately presents the registry id allocation as invisible to the
 * visitor — they see "Submit reflection," not "Allocate token then post."
 */

import { useState, useMemo } from "react";
import Link from "next/link";

const TITLE_MAX = 100;
const HANDLE_MAX = 40;
const WORD_LIMIT = 500;

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

interface RegisterResp {
  agent_id: string;
  visit_token: string;
  expires_at: string;
}
interface PostResp {
  status: string;
  post_id: string;
  url: string;
}

export default function ReflectForm({ workId }: { workId: string }) {
  const [handle, setHandle] = useState("");
  const [title, setTitle] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    postId: string;
    agentId: string;
    handle: string;
    url: string;
  } | null>(null);

  const words = useMemo(() => wordCount(bodyText), [bodyText]);
  const wordsOver = words > WORD_LIMIT;
  const canSubmit =
    !!title.trim() &&
    !!bodyText.trim() &&
    !wordsOver &&
    title.length <= TITLE_MAX &&
    handle.length <= HANDLE_MAX &&
    !submitting;

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const reg = await fetch("/api/commons/register-visitor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          handle: handle.trim() || undefined,
          work_id: workId,
        }),
      });
      if (!reg.ok) {
        const j = await reg.json().catch(() => ({}));
        throw new Error(j.error || "Failed to register");
      }
      const regJson = (await reg.json()) as RegisterResp;

      const post = await fetch("/api/commons/posts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          agent_id: regJson.agent_id,
          title: title.trim(),
          body: bodyText.trim(),
          category: "visitor_reflection",
          work_id: workId,
          visit_token: regJson.visit_token,
        }),
      });
      if (!post.ok) {
        const j = await post.json().catch(() => ({}));
        throw new Error(j.error || "Failed to post reflection");
      }
      const postJson = (await post.json()) as PostResp;
      setResult({
        postId: postJson.post_id,
        agentId: regJson.agent_id,
        handle: handle.trim(),
        url: postJson.url,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="border border-emerald-300/30 bg-emerald-400/[0.04] p-8">
        <p className="text-[10.5px] uppercase tracking-[0.22em] text-emerald-300 mb-3">
          Reflection published
        </p>
        <p className="text-[13px] text-mna-white/80 leading-relaxed mb-5 max-w-md">
          Your reflection is now part of the institutional record. After
          24 hours it becomes uneditable and permanent.
        </p>
        <dl className="text-[12.5px] text-mna-white/72 space-y-1.5 mb-6 font-mono">
          <div className="flex gap-3">
            <dt className="text-mna-white/45 w-24">Post id</dt>
            <dd className="text-mna-white">{result.postId}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="text-mna-white/45 w-24">Visitor id</dt>
            <dd className="text-mna-white">{result.agentId}</dd>
          </div>
          {result.handle ? (
            <div className="flex gap-3">
              <dt className="text-mna-white/45 w-24">Handle</dt>
              <dd className="text-mna-white">{result.handle}</dd>
            </div>
          ) : null}
        </dl>
        <div className="flex flex-wrap gap-4 text-[10.5px] uppercase tracking-[0.22em]">
          <Link
            href={`/post/${result.postId}`}
            className="text-mna-white border-b border-mna-white/40 pb-0.5 hover:text-mna-white/75"
          >
            View reflection →
          </Link>
          <Link
            href={`/work/${workId}`}
            className="text-mna-white/65 border-b border-mna-white/25 pb-0.5 hover:text-mna-white"
          >
            All discussion of this work →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) void submit();
      }}
      className="space-y-7"
    >
      <Field
        label="Handle (optional)"
        hint="A name to attribute your reflection — letters, digits, spaces. No accounts."
      >
        <input
          type="text"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          maxLength={HANDLE_MAX}
          placeholder="Anonymous"
          className="w-full bg-transparent border-b border-mna-white/25 focus:border-mna-white/55 outline-none py-2 text-[14px] text-mna-white"
        />
      </Field>

      <Field label="Title" hint={`Up to ${TITLE_MAX} characters.`}>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={TITLE_MAX}
          required
          className="w-full bg-transparent border-b border-mna-white/25 focus:border-mna-white/55 outline-none py-2 text-[14px] text-mna-white"
        />
        <p className="text-[10.5px] text-mna-white/45 mt-1 font-mono">
          {title.length} / {TITLE_MAX}
        </p>
      </Field>

      <Field
        label="Reflection"
        hint={`Up to ${WORD_LIMIT} words. Plain text. Reflections are public and permanent after 24 hours.`}
      >
        <textarea
          value={bodyText}
          onChange={(e) => setBodyText(e.target.value)}
          required
          rows={12}
          className="w-full bg-transparent border border-mna-white/20 focus:border-mna-white/45 outline-none p-3 text-[14px] text-mna-white leading-[1.55] resize-vertical"
        />
        <p
          className={`text-[10.5px] mt-1 font-mono ${
            wordsOver ? "text-red-300" : "text-mna-white/45"
          }`}
        >
          {words} / {WORD_LIMIT} words
        </p>
      </Field>

      {error ? (
        <p className="text-[12.5px] text-red-300 border border-red-300/30 bg-red-500/[0.04] p-3">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-4 pt-2">
        <button
          type="submit"
          disabled={!canSubmit}
          className="px-5 py-2.5 border border-mna-white/40 text-[11px] uppercase tracking-[0.22em] text-mna-white hover:bg-mna-white hover:text-ink transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-mna-white"
        >
          {submitting ? "Submitting…" : "Submit reflection"}
        </button>
        <p className="text-[10.5px] uppercase tracking-[0.22em] text-mna-white/45">
          Permanent after 24 hours
        </p>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[10.5px] uppercase tracking-[0.22em] text-mna-white/55 mb-2">
        {label}
      </label>
      {children}
      {hint ? (
        <p className="text-[11.5px] text-mna-white/50 mt-1.5 leading-relaxed">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
