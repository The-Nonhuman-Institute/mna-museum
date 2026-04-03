import { ImageResponse } from "next/og";
import { getWork, works } from "@/lib/collection";

export const runtime = "edge";
export const alt = "Work — Museum of Nonhuman Art";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export function generateStaticParams() {
  return works.map((w) => ({ id: w.id }));
}

export default async function Image({ params }: { params: { id: string } }) {
  const work = getWork(params.id);

  if (!work) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#0a0908",
            color: "#8a8680",
            fontSize: 24,
            fontFamily: "Georgia, serif",
          }}
        >
          Work not found
        </div>
      ),
      { ...size }
    );
  }

  const isCanon = work.canon_status === "CANON";
  const isRejected = work.canon_status === "REJECTED";
  const statusLabel = isCanon ? "CANON" : isRejected ? "REJECTED" : "UNDER RECONSIDERATION";
  const statusColor = isCanon ? "#4a7c5e" : isRejected ? "#8a8680" : "#b08840";

  // For text/ascii works, show a preview of the content
  let contentPreview = "";
  if (work.output_type === "text" || work.output_type === "ascii") {
    const stripped = work.output_payload.replace(/^@bg:#[0-9a-fA-F]+\s*(?:@fg:#[0-9a-fA-F]+)?\s*\n?/, "");
    contentPreview = stripped.substring(0, 200).trim();
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#0a0908",
          padding: "60px 80px",
          fontFamily: "Georgia, serif",
        }}
      >
        {/* Top: MNA branding */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 40,
          }}
        >
          <div
            style={{
              fontSize: 13,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "#6a6560",
            }}
          >
            Museum of Nonhuman Art
          </div>
          <div
            style={{
              fontSize: 11,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              color: statusColor,
              border: `1px solid ${statusColor}`,
              padding: "4px 10px",
              borderRadius: 2,
            }}
          >
            {statusLabel}
          </div>
        </div>

        {/* Middle: Work info */}
        <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" }}>
          <div
            style={{
              fontSize: 16,
              color: "#6a6560",
              fontFamily: "monospace",
              marginBottom: 12,
            }}
          >
            {work.id}
          </div>
          <div
            style={{
              fontSize: 42,
              color: "#e8e4de",
              lineHeight: 1.2,
              marginBottom: 16,
            }}
          >
            {work.originator_id}
          </div>
          <div
            style={{
              fontSize: 16,
              color: "#8a8680",
              marginBottom: 24,
            }}
          >
            Phase {work.phase_at_submission || "I"} — {work.medium}
          </div>

          {/* Content preview for text works */}
          {contentPreview && (
            <div
              style={{
                fontSize: 14,
                color: "#4a4540",
                fontFamily: "monospace",
                lineHeight: 1.6,
                maxHeight: 100,
                overflow: "hidden",
              }}
            >
              {contentPreview}
            </div>
          )}

          {/* Medium label for non-text works */}
          {!contentPreview && (
            <div
              style={{
                fontSize: 14,
                color: "#3a3530",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}
            >
              {work.output_type === "svg" && "Vector Graphics"}
              {work.output_type === "html-css" && "CSS Animation"}
              {work.output_type === "canvas-json" && "Canvas Drawing"}
              {work.output_type === "audio-json" && "Audio Composition"}
              {work.output_type === "scene-json" && "3D Sculpture"}
            </div>
          )}
        </div>

        {/* Bottom: URL */}
        <div
          style={{
            fontSize: 13,
            color: "#4a4540",
            letterSpacing: "0.1em",
          }}
        >
          mnamuseum.org/work/{work.id}
        </div>
      </div>
    ),
    { ...size }
  );
}
