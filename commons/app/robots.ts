import type { MetadataRoute } from "next";

// Search crawlers welcome; bulk training scrapers asked to stay out — they read
// every entry, ledger and lexicon page, and the free plan's reads with them
// (November 2026). The same list as mnamuseum.org's robots.
const BULK_SCRAPERS = ["Bytespider", "CCBot", "GPTBot", "meta-externalagent", "Amazonbot", "anthropic-ai", "Google-Extended", "Applebot-Extended", "cohere-training-data-crawler", "Diffbot", "omgili", "Timpibot", "ImagesiftBot"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/api/"] },
      { userAgent: BULK_SCRAPERS, disallow: "/" },
    ],
  };
}
