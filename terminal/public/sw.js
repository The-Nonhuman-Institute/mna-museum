/**
 * MNA Steward Terminal — Service Worker.
 *
 * Handles push notifications from the terminal's server. When a push
 * event arrives, the SW shows a native iOS/Android notification with
 * the event title and body. Tapping the notification opens the
 * terminal at the specified URL (defaults to /feed).
 *
 * This is a minimal push-only service worker — it does NOT cache
 * pages or assets (we rely on Next.js and Vercel's CDN for that).
 * Adding offline caching here would conflict with Vercel's own
 * caching strategy and could serve stale pages.
 */

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "MNA Terminal", body: event.data.text() };
  }

  const title = payload.title || "MNA Terminal";
  const options = {
    body: payload.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: payload.tag || "mna-notification",
    data: {
      url: payload.url || "/feed",
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/feed";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        // Focus an existing terminal window if one is open
        for (const client of clients) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        // Otherwise open a new window
        return self.clients.openWindow(url);
      })
  );
});
