import { redirect } from "next/navigation";

/**
 * Root redirect. Authenticated requests land on /feed (the primary
 * operator view). Unauthenticated requests are caught by middleware and
 * sent to /login before ever reaching this page, so the happy path is
 * always a direct redirect to /feed.
 */
export default function RootPage() {
  redirect("/feed");
}
