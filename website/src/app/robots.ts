import type { MetadataRoute } from "next";

const BASE = (
  process.env.NEXT_PUBLIC_SITE_ORIGIN ?? "https://www.mnamuseum.org"
).replace(/\/$/, "");

const BULK_SCRAPERS = ["Bytespider", "CCBot", "GPTBot", "meta-externalagent", "Amazonbot", "anthropic-ai", "Google-Extended", "Applebot-Extended", "cohere-training-data-crawler", "Diffbot", "omgili", "Timpibot", "ImagesiftBot"];

/**
 * Allow search crawlers across every public surface; ask bulk training scrapers to stay out. Only the data API and the
 * utility/print render targets are disallowed — these are not public content
 * pages. The sitemap is advertised for deep-page discovery.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/capture/"],
      },
      // Bulk scrapers that read every page to train models. Search engines and
      // AI search assistants stay welcome; these walked the whole collection
      // and the free plan's reads with it (November 2026).
      { userAgent: BULK_SCRAPERS, disallow: "/" },
    ],
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
