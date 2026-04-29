/**
 * InstitutionalNotice — small dark-mode confirmation/notice screen.
 *
 * Used for /newsletter/{confirmed,error,unsubscribed} and any other
 * single-card "outcome" page. Centered card on the dark page surface
 * with eyebrow + serif title + body + primary CTA. Mirrors the
 * institutional notice email templates (NoticeOfAccession etc.) so the
 * site → email handoff feels like the same document system.
 */

import * as React from "react";
import Link from "next/link";

export interface InstitutionalNoticeProps {
  eyebrow: string;
  title: string;
  body: React.ReactNode;
  cta?: { href: string; label: string };
  /** Tone of the icon mark above the eyebrow — accent picks up the
   *  notice's character (success/warning/info). */
  tone?: "info" | "success" | "warning";
}

export default function InstitutionalNotice({
  eyebrow,
  title,
  body,
  cta = { href: "/", label: "Return Home" },
  tone = "info",
}: InstitutionalNoticeProps) {
  return (
    <div className="bg-ink text-mna-white min-h-screen flex items-center justify-center px-5 md:px-6 py-24">
      <div className="w-full max-w-[520px]">
        <div className="border border-mna-white/15 bg-black/30 px-7 md:px-10 py-12 md:py-14">
          <div className="flex items-center justify-center mb-7">
            <NoticeMark tone={tone} />
          </div>
          <p className="text-[10px] uppercase tracking-[0.32em] text-mna-white/55 text-center mb-4">
            {eyebrow}
          </p>
          <h1
            className="font-serif font-light text-mna-white text-center"
            style={{
              fontSize: "clamp(28px, 3.6vw, 38px)",
              lineHeight: "1.12",
              letterSpacing: "-0.005em",
            }}
          >
            {title}
          </h1>
          <div className="w-10 h-px bg-mna-white/35 mx-auto mt-6 mb-7" />
          <div className="text-[14px] leading-[1.6] text-mna-white/72 text-center">
            {body}
          </div>
          <div className="mt-9 flex justify-center">
            <Link
              href={cta.href}
              className="inline-flex items-center gap-3 border border-mna-white/35 px-6 py-3 text-[10.5px] uppercase tracking-[0.26em] text-mna-white hover:border-mna-white hover:bg-mna-white/[0.04] transition-colors"
            >
              {cta.label}
              <span aria-hidden>→</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function NoticeMark({ tone }: { tone: "info" | "success" | "warning" }) {
  const stroke =
    tone === "success"
      ? "#86efac"
      : tone === "warning"
      ? "#fcd34d"
      : "rgba(255,255,255,0.65)";
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden>
      <circle cx="18" cy="18" r="14.5" stroke={stroke} strokeWidth="0.7" />
      <circle cx="18" cy="18" r="3" fill={stroke} />
    </svg>
  );
}
