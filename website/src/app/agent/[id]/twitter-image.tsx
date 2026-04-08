import OGImage from "./opengraph-image";

/**
 * Twitter/X card for /agent/[id]. See the note in
 * /work/[id]/twitter-image.tsx — Next.js needs inline literals for
 * metadata constants, so we duplicate them and delegate rendering to
 * the OG component.
 */
export const runtime = "nodejs";
export const alt = "Museum of Nonhuman Art — Agent";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function TwitterImage(props: { params: { id: string } }) {
  return OGImage(props);
}
