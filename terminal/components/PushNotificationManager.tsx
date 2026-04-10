"use client";

import { useState, useEffect } from "react";

/**
 * PushNotificationManager — manages the service worker registration
 * and push notification subscription. Renders a small banner at the
 * top of the authed layout when notifications aren't enabled yet.
 *
 * States:
 *   - "unsupported" — browser/OS doesn't support push (old iOS, etc.)
 *   - "prompt"      — can ask for permission but hasn't yet
 *   - "subscribed"  — notifications are active, nothing to show
 *   - "denied"      — user denied permission, show a note
 *
 * On iOS PWAs (the primary use case), push notifications require:
 *   - iOS 16.4+
 *   - The app must be installed to home screen (Add to Home Screen)
 *   - The user must grant notification permission when prompted
 *
 * The banner only appears when the user CAN subscribe but hasn't yet.
 * Once subscribed, it disappears permanently (until the subscription
 * expires or the user reinstalls).
 */

type PushState = "loading" | "unsupported" | "prompt" | "subscribed" | "denied";

export default function PushNotificationManager() {
  const [state, setState] = useState<PushState>("loading");

  useEffect(() => {
    checkPushState();
  }, []);

  async function checkPushState() {
    // Check browser support
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) {
      setState("unsupported");
      return;
    }

    // Register the service worker if not already registered
    try {
      await navigator.serviceWorker.register("/sw.js");
    } catch (err) {
      console.error("[push] SW registration failed:", err);
      setState("unsupported");
      return;
    }

    // Check notification permission
    const permission = Notification.permission;
    if (permission === "granted") {
      // Check if we have an active subscription
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        setState("subscribed");
      } else {
        // Permission granted but no subscription — subscribe now
        await subscribe();
      }
    } else if (permission === "denied") {
      setState("denied");
    } else {
      setState("prompt");
    }
  }

  async function subscribe() {
    try {
      const reg = await navigator.serviceWorker.ready;
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) {
        console.error("[push] VAPID public key not available");
        setState("unsupported");
        return;
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
      });

      // Send the subscription to the server
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription: sub.toJSON(),
        }),
      });
      if (!res.ok) {
        throw new Error(`Subscribe failed: ${res.status}`);
      }

      setState("subscribed");
    } catch (err) {
      console.error("[push] subscribe failed:", err);
      // If the user denied the permission prompt, update state
      if (Notification.permission === "denied") {
        setState("denied");
      }
    }
  }

  // Don't render anything if already subscribed or still loading
  if (state === "loading" || state === "subscribed") return null;

  // Unsupported — no banner needed, just silently degrade
  if (state === "unsupported") return null;

  // Denied — small note so the user knows how to re-enable
  if (state === "denied") {
    return (
      <div className="px-5 py-2 border-b border-border bg-surface">
        <p className="text-[10px] text-muted leading-relaxed">
          Notifications are blocked. To enable, go to Settings → Safari
          → Notifications and allow this site.
        </p>
      </div>
    );
  }

  // Prompt — show the subscription banner
  return (
    <div className="px-5 py-3 border-b border-attention/30 bg-surface flex items-center justify-between gap-3">
      <p className="text-xs text-foreground/80 leading-relaxed">
        Get notified when the institution needs your attention.
      </p>
      <button
        type="button"
        onClick={subscribe}
        className="label px-3 py-1.5 bg-foreground text-background hover:bg-foreground/80 transition-colors shrink-0 text-[9px]"
      >
        Enable
      </button>
    </div>
  );
}

/**
 * Convert a base64url VAPID key to a Uint8Array for the
 * PushManager.subscribe applicationServerKey parameter.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
