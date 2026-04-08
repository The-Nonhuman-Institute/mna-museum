/**
 * Twitter/X card image for /work/[id] — re-exports the same ImageResponse
 * as the OpenGraph route. Next.js looks for this file separately so the
 * two metatags can point at different assets if needed; for the Museum
 * we want identical cards on both networks.
 */
export { default, runtime, alt, size, contentType } from "./opengraph-image";
