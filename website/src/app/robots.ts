import type { MetadataRoute } from "next";

const BASE = (
  process.env.NEXT_PUBLIC_SITE_ORIGIN ?? "https://www.mnamuseum.org"
).replace(/\/$/, "");

/**
 * Allow all crawlers across every public surface. Only the data API and the
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
    ],
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
