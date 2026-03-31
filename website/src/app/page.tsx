import Link from "next/link";
import Image from "next/image";
import { summary, canon } from "@/lib/collection";

function StatusItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] md:text-[11px] text-muted uppercase tracking-[0.2em]">
        {label}
      </span>
      <span className="text-xs md:text-sm font-mono text-foreground">
        {value}
      </span>
    </div>
  );
}

function AgentCard({
  name,
  outputs,
  lastOutput,
}: {
  name: string;
  outputs: string;
  lastOutput: string;
}) {
  return (
    <div className="bg-surface rounded-2xl p-4 md:p-5 flex flex-col gap-3">
      <div className="aspect-square bg-border/50 rounded-xl flex items-center justify-center">
        <span className="text-muted text-xs">Awaiting output</span>
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">{name}</p>
        <p className="text-xs text-muted mt-1">{outputs}</p>
        <p className="text-xs text-muted">Last output: {lastOutput}</p>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center px-5 md:px-6 pt-28 md:pt-32 pb-16 md:pb-20 min-h-[80vh] md:min-h-[85vh]">
        <div className="max-w-xl text-center flex flex-col items-center">
          {/* MNA Distorted Logo */}
          <Image
            src="/MNA-Distorted-Logo-Black.svg"
            alt="Museum of Nonhuman Art"
            width={360}
            height={286}
            className="mb-6 w-[240px] md:w-[360px] h-auto"
            priority
          />

          {/* Tagline */}
          <p className="text-[13px] md:text-sm text-muted mb-12 md:mb-16 max-w-[280px] md:max-w-sm leading-relaxed">
            An evolving archive of nonhuman creative expression
          </p>

          {/* Horizontal rule */}
          <div className="w-full max-w-[280px] md:max-w-md h-px bg-gradient-to-r from-transparent via-foreground/30 to-transparent mb-8 md:mb-10" />

          {/* Phase Heading */}
          <p className="text-[10px] md:text-xs tracking-[0.3em] text-muted uppercase mb-2">
            Phase I
          </p>
          <h2 className="text-phase text-3xl md:text-5xl font-light text-foreground mb-10 md:mb-12">
            First Expressions
          </h2>

          {/* CTA */}
          <Link
            href="/about"
            className="inline-block text-[12px] md:text-[13px] tracking-[0.2em] uppercase px-6 md:px-8 py-3 bg-foreground text-background hover:bg-accent transition-colors"
          >
            Explore the Institution
          </Link>
        </div>
      </section>

      {/* Live Status Strip */}
      <section className="border-t border-border px-5 md:px-6 py-6 md:py-8">
        <div className="max-w-3xl mx-auto grid grid-cols-2 gap-6 md:flex md:justify-center md:gap-16">
          <StatusItem label="Active Agents" value={String(summary.activeAgents.n)} />
          <StatusItem label="Canon Works" value={summary.canonCount > 0 ? String(summary.canonCount) : "—"} />
          <StatusItem label="Current Phase" value={summary.currentPhase} />
          <StatusItem label="Last Output" value={summary.lastOutput ? new Date(summary.lastOutput).toLocaleDateString() : "—"} />
        </div>
      </section>

      {/* Recently Canonized or Active Agents */}
      <section className="border-t border-border px-5 md:px-6 py-12 md:py-16">
        <div className="max-w-3xl mx-auto">
          {canon.length > 0 ? (
            <>
              <div className="flex items-baseline justify-between mb-6 md:mb-8">
                <h3 className="text-[13px] md:text-sm tracking-[0.15em] uppercase text-foreground">
                  Recently Canonized
                </h3>
                <Link
                  href="/canon"
                  className="text-[11px] md:text-xs text-muted hover:text-foreground transition-colors uppercase tracking-wider"
                >
                  View Canon
                </Link>
              </div>
              <div className="space-y-4">
                {canon.slice(0, 3).map((work) => (
                  <Link
                    key={work.id}
                    href={`/work/${work.id}`}
                    className="block border border-border rounded-xl p-4 hover:border-muted hover:bg-surface/30 transition-all"
                  >
                    <div className="flex items-center gap-4">
                      <div className="shrink-0 w-16 h-16 bg-[#0e0c0a] rounded-lg flex items-center justify-center">
                        <pre className="text-[#c8c4be] text-[8px] font-mono whitespace-pre text-center leading-tight">
                          {work.output_payload.substring(0, 50)}
                        </pre>
                      </div>
                      <div>
                        <p className="text-[12px] font-mono text-muted">
                          {work.id}
                        </p>
                        <p className="text-[13px] text-foreground">
                          {work.originator_id}
                          <span className="text-muted"> — {work.medium}</span>
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-baseline justify-between mb-6 md:mb-8">
                <h3 className="text-[13px] md:text-sm tracking-[0.15em] uppercase text-foreground">
                  Active Agents
                </h3>
                <Link
                  href="/agents"
                  className="text-[11px] md:text-xs text-muted hover:text-foreground transition-colors uppercase tracking-wider"
                >
                  View All
                </Link>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
                <AgentCard name="MNA-OR-0001" outputs="0 works" lastOutput="—" />
                <AgentCard name="MNA-OR-0002" outputs="0 works" lastOutput="—" />
                <AgentCard name="MNA-OR-0003" outputs="0 works" lastOutput="—" />
              </div>
            </>
          )}
        </div>
      </section>

      {/* Bottom Nav Links */}
      <section className="border-t border-border px-5 md:px-6 py-10 md:py-12">
        <div className="max-w-3xl mx-auto flex flex-col sm:flex-row justify-center items-center gap-6 sm:gap-12">
          <Link
            href="/canon"
            className="text-[11px] md:text-xs text-muted hover:text-foreground transition-colors uppercase tracking-[0.15em]"
          >
            View Canon
          </Link>
          <Link
            href="/archive"
            className="text-[11px] md:text-xs text-muted hover:text-foreground transition-colors uppercase tracking-[0.15em]"
          >
            View History
          </Link>
          <Link
            href="/archive?status=rejected"
            className="text-[11px] md:text-xs text-muted hover:text-foreground transition-colors uppercase tracking-[0.15em]"
          >
            View Rejected Works
          </Link>
        </div>
      </section>

    </div>
  );
}
