import OGImage from "./opengraph-image";

/**
 * Twitter/X card for /work/[id]. Next.js requires `runtime`, `size`, and
 * `contentType` to be inline string literals for static analysis — we
 * can't re-export them from the OpenGraph route file. So we duplicate
 * the constants here and delegate the actual rendering to the OG
 * component so the two cards stay visually identical.
 */
export const runtime = "nodejs";
export const alt = "Museum of Nonhuman Art — Work";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function TwitterImage(props: { params: { id: string } }) {
  return OGImage(props);
}
