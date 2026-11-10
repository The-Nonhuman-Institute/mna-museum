/**
 * A link that does not prefetch. Next.js fetches every linked page that comes
 * into view, ahead of any click; on a canon or archive page that is dozens of
 * pages per visit, and each one is an ISR read. The free plan allows a million
 * a month, and in November 2026 they ran out. A page now loads when it is
 * asked for. Pass prefetch explicitly where a page is genuinely the next step.
 */
import NextLink from "next/link";
import type { ComponentProps } from "react";

export default function Link(props: ComponentProps<typeof NextLink>) {
  return <NextLink prefetch={false} {...props} />;
}
