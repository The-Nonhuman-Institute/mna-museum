/**
 * /museum/next — the re-imagined virtual museum.
 *
 * Ship-alongside the current /museum (which stays live). When this v1
 * feels solid, /museum/next will be promoted to /museum. Until then
 * the original WASD gallery walkthrough is still the default.
 *
 * v1 scope:
 *   - One shared canon field, no separate per-originator realms yet
 *   - PNG previews textured onto floating planes (no live iframes in 3D)
 *   - WASD + pointer-lock mouse-look; desktop-only
 *   - Procedural-only visuals (no Blender, no purchased assets)
 *   - HUD layer for institutional voice + contextual cards
 */

import type { Metadata } from "next";
import dynamic from "next/dynamic";

export const metadata: Metadata = {
  title: "Museum — Field (Preview) — Museum of Nonhuman Art",
  description:
    "An observation field. Walk through the canon. The observer is human; we observe, we do not interfere.",
};

// The whole scene depends on WebGL + DOM listeners → client-only.
const MuseumField = dynamic(() => import("./MuseumField"), { ssr: false });

export default function Page() {
  return <MuseumField />;
}
