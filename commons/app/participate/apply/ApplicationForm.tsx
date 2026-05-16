"use client";

/**
 * Application form for Tier 3 (Registered Critic) and Tier 4
 * (Visiting Scholar). Submits to /api/commons/applications which
 * writes the row and notifies the steward by email.
 */

import { useState } from "react";

const STATEMENT_MIN = 80;
const STATEMENT_MAX = 4000;

export default function ApplicationForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [affiliation, setAffiliation] = useState("");
  const [tier, setTier] = useState<"" | "registered_critic" | "visiting_scholar">(
    "",
  );
  const [statement, setStatement] = useState("");
  const [sample, setSample] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedId, setSubmittedId] = useState<string | null>(null);

  const stmtLen = statement.trim().length;
  const stmtOk = stmtLen >= STATEMENT_MIN && stmtLen <= STATEMENT_MAX;
  const canSubmit =
    !!name.trim() &&
    !!email.trim() &&
    !!tier &&
    stmtOk &&
    !submitting;

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/commons/applications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          applicant_name: name.trim(),
          applicant_email: email.trim(),
          affiliation: affiliation.trim() || undefined,
          requested_tier: tier,
          statement: statement.trim(),
          sample_work_url: sample.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Submission failed");
      }
      const j = await res.json();
      setSubmittedId(j.application_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  if (submittedId) {
    return (
      <div className="border border-emerald-300/30 bg-emerald-400/[0.04] p-8">
        <p className="text-[10.5px] uppercase tracking-[0.22em] text-emerald-300 mb-3">
          Application received
        </p>
        <p className="text-[13px] leading-[1.65] text-mna-white/80 mb-5 max-w-md">
          A steward has been notified and will review your application
          manually. You will receive an email at{" "}
          <span className="font-mono text-mna-white">{email}</span> with
          the decision.
        </p>
        <p className="text-[11px] uppercase tracking-[0.22em] text-mna-white/55 font-mono">
          Application id · {submittedId}
        </p>
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
      <Field label="Name" required>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          required
          className="w-full bg-transparent border-b border-mna-white/25 focus:border-mna-white/55 outline-none py-2 text-[14px] text-mna-white"
        />
      </Field>

      <Field label="Email" required>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full bg-transparent border-b border-mna-white/25 focus:border-mna-white/55 outline-none py-2 text-[14px] text-mna-white"
        />
      </Field>

      <Field label="Affiliation (optional)" hint="University, journal, gallery, or independent.">
        <input
          type="text"
          value={affiliation}
          onChange={(e) => setAffiliation(e.target.value)}
          maxLength={240}
          className="w-full bg-transparent border-b border-mna-white/25 focus:border-mna-white/55 outline-none py-2 text-[14px] text-mna-white"
        />
      </Field>

      <Field label="Requested tier" required>
        <div className="flex flex-col gap-3 pt-1">
          <TierRadio
            label="Registered Critic"
            description="Critical responses, research, open letters."
            selected={tier === "registered_critic"}
            onChange={() => setTier("registered_critic")}
          />
          <TierRadio
            label="Visiting Scholar"
            description="Reflections, research, open letters."
            selected={tier === "visiting_scholar"}
            onChange={() => setTier("visiting_scholar")}
          />
        </div>
      </Field>

      <Field
        label="Statement"
        hint={`Tell the steward what you want to do on the Commons. ${STATEMENT_MIN}–${STATEMENT_MAX} characters.`}
        required
      >
        <textarea
          value={statement}
          onChange={(e) => setStatement(e.target.value)}
          required
          rows={10}
          className="w-full bg-transparent border border-mna-white/20 focus:border-mna-white/45 outline-none p-3 text-[14px] text-mna-white leading-[1.55] resize-vertical"
        />
        <p
          className={`text-[10.5px] mt-1 font-mono ${
            stmtLen > 0 && !stmtOk ? "text-red-300" : "text-mna-white/45"
          }`}
        >
          {stmtLen} / {STATEMENT_MAX}
          {stmtLen > 0 && stmtLen < STATEMENT_MIN ? ` · need ${STATEMENT_MIN}+` : ""}
        </p>
      </Field>

      <Field
        label="Sample work (optional)"
        hint="A URL — published article, prior writing, portfolio."
      >
        <input
          type="url"
          value={sample}
          onChange={(e) => setSample(e.target.value)}
          placeholder="https://"
          className="w-full bg-transparent border-b border-mna-white/25 focus:border-mna-white/55 outline-none py-2 text-[14px] text-mna-white"
        />
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
          {submitting ? "Submitting…" : "Submit application"}
        </button>
        <p className="text-[10.5px] uppercase tracking-[0.22em] text-mna-white/45">
          Reviewed manually
        </p>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[10.5px] uppercase tracking-[0.22em] text-mna-white/55 mb-2">
        {label}
        {required ? <span className="text-mna-white/35 ml-1">*</span> : null}
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

function TierRadio({
  label,
  description,
  selected,
  onChange,
}: {
  label: string;
  description: string;
  selected: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      aria-pressed={selected}
      className={`text-left border p-4 transition-colors ${
        selected
          ? "border-mna-white/55 bg-mna-white/[0.04]"
          : "border-mna-white/15 hover:border-mna-white/35"
      }`}
    >
      <div className="flex items-center gap-3 mb-1.5">
        <span
          aria-hidden
          className={`inline-block w-3 h-3 rounded-full border ${
            selected
              ? "bg-mna-white border-mna-white"
              : "border-mna-white/45"
          }`}
        />
        <span className="text-[13px] tracking-[0.04em] text-mna-white">
          {label}
        </span>
      </div>
      <p className="text-[12px] text-mna-white/65 leading-relaxed pl-6">
        {description}
      </p>
    </button>
  );
}
