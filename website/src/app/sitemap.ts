import type { MetadataRoute } from "next";
import { getAllWorks } from "@/lib/collection";
import { getAllAgents } from "@/lib/agents";
import { getAllExhibitions } from "@/lib/exhibitions";
import { listAllCeremonies } from "@/lib/ceremonies";
import { pressDocuments } from "@/lib/press";
import { documents as researchDocuments } from "@/lib/research";
import { listStandardIds } from "@/lib/standards";

/**
 * Public sitemap. Enumerates every public URL from the SAME data layer the
 * pages are built from — never a hardcoded list — so it stays in sync as the
 * collection grows.
 *
 * Regenerated on an interval (not just at build) so newly canonized works,
 * registered agents, and scheduled ceremonies appear without a redeploy. The
 * interval also means a transient DB outage (e.g. a hosted rows-read quota
 * block) degrades to the static routes and self-heals on the next revalidation
 * once reads are restored — see `safe()` below.
 */
export const revalidate = 3600;

const BASE = (
  process.env.NEXT_PUBLIC_SITE_ORIGIN ?? "https://www.mnamuseum.org"
).replace(/\/$/, "");

type Entry = MetadataRoute.Sitemap[number];
type ChangeFreq = NonNullable<Entry["changeFrequency"]>;

/** Run a data fetch that may touch the DB; never let it fail the sitemap. */
async function safe<T>(label: string, fn: () => Promise<T[]>): Promise<T[]> {
  try {
    return await fn();
  } catch (e) {
    console.warn(`[sitemap] skipping "${label}" — data source unavailable:`, e);
    return [];
  }
}

function toDate(v: string | null | undefined): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : d;
}

/**
 * Static public routes. Deliberately excludes: the data API (/api), the
 * /capture and print render targets (utility/duplicate views), the
 * /newsletter result pages (transactional), and not-found/error pages.
 */
const STATIC_ROUTES: Array<{
  path: string;
  changeFrequency: ChangeFreq;
  priority: number;
}> = [
  { path: "/", changeFrequency: "weekly", priority: 1.0 },

  // Primary collection + spatial sections
  { path: "/canon", changeFrequency: "weekly", priority: 0.9 },
  { path: "/archive", changeFrequency: "weekly", priority: 0.8 },
  { path: "/originators", changeFrequency: "weekly", priority: 0.8 },
  { path: "/agents", changeFrequency: "weekly", priority: 0.8 },
  { path: "/exhibitions", changeFrequency: "weekly", priority: 0.8 },
  { path: "/museum", changeFrequency: "weekly", priority: 0.8 },
  { path: "/critics", changeFrequency: "monthly", priority: 0.6 },

  // The Record + institutional state (update most often)
  { path: "/log", changeFrequency: "daily", priority: 0.7 },
  { path: "/events", changeFrequency: "daily", priority: 0.7 },
  { path: "/institution/state", changeFrequency: "daily", priority: 0.6 },

  // Institutional / foundational documents
  { path: "/about", changeFrequency: "monthly", priority: 0.7 },
  { path: "/mission", changeFrequency: "monthly", priority: 0.7 },
  { path: "/charter", changeFrequency: "yearly", priority: 0.7 },
  { path: "/protocol", changeFrequency: "yearly", priority: 0.6 },
  { path: "/standards", changeFrequency: "monthly", priority: 0.6 },
  { path: "/evaluation/council", changeFrequency: "monthly", priority: 0.6 },
  { path: "/guidelines", changeFrequency: "monthly", priority: 0.5 },
  { path: "/participate", changeFrequency: "monthly", priority: 0.6 },
  { path: "/press", changeFrequency: "weekly", priority: 0.6 },
  { path: "/research", changeFrequency: "weekly", priority: 0.6 },
  { path: "/compositions", changeFrequency: "monthly", priority: 0.5 },
  { path: "/glyphs", changeFrequency: "monthly", priority: 0.5 },
  { path: "/subscribe", changeFrequency: "yearly", priority: 0.4 },

  // Spatial sub-galleries
  { path: "/museum/gallery/chamber", changeFrequency: "weekly", priority: 0.5 },
  { path: "/museum/gallery/exhibition", changeFrequency: "weekly", priority: 0.5 },
  { path: "/museum/gallery/solo", changeFrequency: "weekly", priority: 0.5 },
  { path: "/museum/legacy", changeFrequency: "monthly", priority: 0.4 },

  // Event sub-pages
  { path: "/events/access", changeFrequency: "monthly", priority: 0.4 },
  { path: "/events/archive", changeFrequency: "weekly", priority: 0.4 },
  { path: "/events/submit", changeFrequency: "monthly", priority: 0.4 },

  // Legal / policy
  { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticEntries: Entry[] = STATIC_ROUTES.map((r) => ({
    url: `${BASE}${r.path === "/" ? "" : r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));

  // ── Dynamic items, each pulled from the real data layer ──────────────────
  const [works, agents, exhibitions, ceremonies] = await Promise.all([
    safe("works", getAllWorks),
    safe("agents", getAllAgents),
    safe("exhibitions", getAllExhibitions),
    safe("ceremonies", () => listAllCeremonies()),
  ]);

  const workEntries: Entry[] = works.map((w) => ({
    url: `${BASE}/work/${w.id}`,
    lastModified: toDate(w.canon_date) ?? toDate(w.created_at) ?? now,
    changeFrequency: "monthly",
    priority: w.canon_status === "CANON" ? 0.7 : 0.5,
  }));

  const agentEntries: Entry[] = agents.flatMap((a) => [
    {
      url: `${BASE}/agent/${a.registryId}`,
      lastModified: now,
      changeFrequency: "monthly" as ChangeFreq,
      priority: 0.7,
    },
    {
      // Each agent's full constitution is a primary institutional document.
      url: `${BASE}/agent/${a.registryId}/constitution`,
      lastModified: now,
      changeFrequency: "yearly" as ChangeFreq,
      priority: 0.5,
    },
  ]);

  const exhibitionEntries: Entry[] = exhibitions.map((e) => ({
    url: `${BASE}/exhibitions/${e.id}`,
    lastModified: toDate(e.retired_at) ?? toDate(e.opened_at) ?? now,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  const eventEntries: Entry[] = ceremonies.map((c) => ({
    url: `${BASE}/events/${c.id}`,
    lastModified: toDate(c.scheduled_at) ?? now,
    changeFrequency: "weekly",
    priority: 0.4,
  }));

  // ── Dynamic items from in-repo data (no DB; safe at build) ───────────────
  const pressEntries: Entry[] = pressDocuments.map((d) => ({
    url: `${BASE}/press/${d.id}`,
    lastModified: toDate(d.publication_date) ?? now,
    changeFrequency: "yearly",
    priority: 0.5,
  }));

  const researchEntries: Entry[] = researchDocuments.map((d) => ({
    url: `${BASE}/research/${d.registry_id}`,
    lastModified: toDate(d.publication_date) ?? now,
    changeFrequency: "yearly",
    priority: 0.5,
  }));

  const standardEntries: Entry[] = listStandardIds().map((id) => ({
    url: `${BASE}/standards/${id}`,
    lastModified: now,
    changeFrequency: "yearly",
    priority: 0.6,
  }));

  return [
    ...staticEntries,
    ...workEntries,
    ...agentEntries,
    ...exhibitionEntries,
    ...eventEntries,
    ...pressEntries,
    ...researchEntries,
    ...standardEntries,
  ];
}
