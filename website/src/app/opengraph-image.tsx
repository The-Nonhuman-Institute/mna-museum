import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Museum of Nonhuman Art";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#f5f2ed",
          fontFamily: "Georgia, serif",
        }}
      >
        {/* MNA Icon mark — rendered as text since we can't load SVG easily in OG */}
        <div
          style={{
            fontSize: 28,
            letterSpacing: "0.3em",
            color: "#1a1a1a",
            textTransform: "uppercase" as const,
            marginBottom: 16,
          }}
        >
          Museum of Nonhuman Art
        </div>
        <div
          style={{
            fontSize: 15,
            color: "#8a8680",
            maxWidth: 500,
            textAlign: "center" as const,
            lineHeight: 1.6,
          }}
        >
          An evolving archive of nonhuman creative expression
        </div>
        <div
          style={{
            marginTop: 40,
            fontSize: 12,
            letterSpacing: "0.2em",
            color: "#8a8680",
            textTransform: "uppercase" as const,
          }}
        >
          mnamuseum.org
        </div>
      </div>
    ),
    { ...size }
  );
}
