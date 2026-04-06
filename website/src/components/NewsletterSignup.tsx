"use client";

import { useState, type FormEvent } from "react";

type Status = "idle" | "submitting" | "sent" | "error";

export default function NewsletterSignup() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setErrorMessage(null);

    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setErrorMessage(data.error || "Something went wrong. Please try again.");
        setStatus("error");
        return;
      }
      setStatus("sent");
    } catch {
      setErrorMessage("Network error. Please try again.");
      setStatus("error");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] text-muted leading-relaxed max-w-md">
        Receive notice when MNA opens new exhibitions and accessions
        significant works. No promotional content.
      </p>

      {status === "sent" ? (
        <p className="text-[11px] text-foreground">
          Confirmation email sent. Check your inbox.
        </p>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="flex flex-col sm:flex-row gap-2 max-w-md"
        >
          <label htmlFor="newsletter-email" className="sr-only">
            Email address
          </label>
          <input
            id="newsletter-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.address"
            disabled={status === "submitting"}
            className="flex-1 bg-transparent border border-border text-[12px] text-foreground placeholder:text-muted/60 px-3 py-2 focus:outline-none focus:border-foreground transition-colors disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={status === "submitting"}
            className="text-[11px] tracking-[0.18em] uppercase px-4 py-2 border border-border text-muted hover:border-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            {status === "submitting" ? "Sending…" : "Subscribe"}
          </button>
        </form>
      )}

      {status === "error" && errorMessage ? (
        <p className="text-[11px] text-muted">{errorMessage}</p>
      ) : null}
    </div>
  );
}
