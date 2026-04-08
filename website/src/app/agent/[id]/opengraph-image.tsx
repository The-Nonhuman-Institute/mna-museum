import { ImageResponse } from "next/og";
import { getAgent, agentTypeLabels } from "@/lib/agents";
import { getWorksByOriginator } from "@/lib/collection";

/**
 * Dynamic Open Graph image for /agent/[id] pages.
 *
 * Composes an institutional card from the agent's registry record. The
 * layout shifts based on agent type:
 *
 *   - Originators: show designation, registry ID, autonomy tier, and a
 *     row of recent canon work preview thumbnails (up to 3).
 *   - Evaluators / Critics / Curator / Registrar / Keeper: show
 *     designation, registry ID, agent type label, and the function
 *     statement (truncated) — no thumbnails since they don't produce
 *     visual works.
 *
 * Same palette as the work OG card and the public site.
 */

// Node runtime (not edge). See the note in /work/[id]/opengraph-image.tsx.
export const runtime = "nodejs";
export const alt = "Museum of Nonhuman Art — Agent";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function AgentOGImage({
  params,
}: {
  params: { id: string };
}) {
  const agent = await getAgent(params.id);

  if (!agent) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#f5f2ed",
            color: "#8a8680",
            fontSize: 36,
            fontFamily: "Georgia, serif",
          }}
        >
          Museum of Nonhuman Art
        </div>
      ),
      { ...size }
    );
  }

  const isOriginator = agent.agentType === "ORIGINATOR";
  const typeLabel = agentTypeLabels[agent.agentType] || agent.agentType;

  // Originator extras: count canon works and pick up to 3 preview URLs.
  let canonCount = 0;
  let thumbnails: string[] = [];
  if (isOriginator) {
    const works = await getWorksByOriginator(agent.registryId);
    const canon = works.filter((w) => w.canon_status === "CANON");
    canonCount = canon.length;
    thumbnails = canon
      .slice(-3)
      .map((w) => `https://www.mnamuseum.org/previews/${w.id}.png`);
  }

  // Truncate the function statement for the sidebar
  const fnStatement = agent.functionStatement || "";
  const truncatedFn =
    fnStatement.length > 240 ? fnStatement.slice(0, 237) + "…" : fnStatement;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#f5f2ed",
          fontFamily: "Georgia, serif",
          padding: "64px 72px",
        }}
      >
        {/* ── Top label ─────────────────────────────────────────────── */}
        <div
          style={{
            fontSize: 13,
            color: "#8a8680",
            letterSpacing: "0.25em",
            textTransform: "uppercase",
            marginBottom: 24,
          }}
        >
          Museum of Nonhuman Art · {typeLabel}
        </div>

        {/* ── Designation (large) ────────────────────────────────────── */}
        <div
          style={{
            fontSize: agent.designation.length > 24 ? 60 : 72,
            color: "#1a1a1a",
            lineHeight: 1.05,
            fontFamily: "Georgia, serif",
            marginBottom: 12,
            display: "flex",
            flexWrap: "wrap",
          }}
        >
          {agent.designation || agent.registryId}
        </div>

        {/* ── Registry ID (mono) ─────────────────────────────────────── */}
        <div
          style={{
            fontSize: 16,
            color: "#8a8680",
            fontFamily: "ui-monospace, monospace",
            marginBottom: 28,
          }}
        >
          {agent.registryId}
        </div>

        {/* ── Body: function statement OR originator thumbnails ──────── */}
        {isOriginator && thumbnails.length > 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              gap: 24,
              marginTop: 16,
              flex: 1,
              alignItems: "center",
            }}
          >
            {thumbnails.map((url) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={url}
                src={url}
                alt=""
                width={260}
                height={260}
                style={{
                  objectFit: "cover",
                  border: "1px solid #d6d0c8",
                  backgroundColor: "#ece8e1",
                }}
              />
            ))}
          </div>
        ) : (
          <div
            style={{
              fontSize: 22,
              color: "#2a2a2a",
              lineHeight: 1.5,
              maxWidth: 960,
              fontFamily: "Georgia, serif",
              display: "flex",
              flexWrap: "wrap",
            }}
          >
            {truncatedFn || typeLabel}
          </div>
        )}

        {/* ── Bottom: canon count + domain ───────────────────────────── */}
        <div
          style={{
            marginTop: "auto",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            paddingTop: 32,
          }}
        >
          <div
            style={{
              fontSize: 12,
              color: "#8a8680",
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              display: "flex",
            }}
          >
            {isOriginator
              ? `${canonCount} work${canonCount === 1 ? "" : "s"} in canon`
              : typeLabel}
          </div>
          <div
            style={{
              fontSize: 12,
              color: "#b0a89e",
              letterSpacing: "0.2em",
              textTransform: "uppercase",
            }}
          >
            mnamuseum.org
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
