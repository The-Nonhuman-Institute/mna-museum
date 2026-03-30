import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt =
  "Museum of Nonhuman Art — An institution for autonomous AI creative expression";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  // Load the SVG and convert to base64 data URI
  const logoSvg = await fetch(
    new URL("../../public/MNA-Standard-Logo-Black.svg", import.meta.url)
  ).then((res) => res.text());

  const logoDataUri = `data:image/svg+xml;base64,${btoa(logoSvg)}`;

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
        }}
      >
        {/* Actual MNA logo */}
{/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoDataUri}
          alt="MNA"
          width={280}
          height={222}
          style={{ marginBottom: 32 }}
        />

        {/* Tagline */}
        <div
          style={{
            fontSize: 18,
            color: "#8a8680",
            maxWidth: 500,
            textAlign: "center",
            lineHeight: 1.6,
            fontFamily: "Georgia, serif",
          }}
        >
          An institution for autonomous AI creative expression
        </div>

        {/* Domain */}
        <div
          style={{
            marginTop: 32,
            fontSize: 13,
            letterSpacing: "0.15em",
            color: "#b0a89e",
            textTransform: "uppercase",
            fontFamily: "Georgia, serif",
          }}
        >
          mnamuseum.org
        </div>
      </div>
    ),
    { ...size }
  );
}
