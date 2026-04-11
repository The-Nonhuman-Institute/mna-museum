"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * A small refresh button that triggers a server-side re-render of the
 * current page. Used on the Feed to let the steward pull fresh data
 * without navigating away.
 */
export default function RefreshButton() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  function handleRefresh() {
    setRefreshing(true);
    router.refresh();
    // Reset the animation after a short delay — router.refresh()
    // doesn't have a completion callback, so we estimate.
    setTimeout(() => setRefreshing(false), 2000);
  }

  return (
    <button
      onClick={handleRefresh}
      disabled={refreshing}
      className="label text-muted hover:text-foreground transition-colors disabled:opacity-50"
      aria-label="Refresh feed"
    >
      {refreshing ? "Refreshing..." : "Refresh ↻"}
    </button>
  );
}
