"use client";

import { useEffect } from "react";

// Only a foreground, focused, online tab may extend the server's ten-minute lease.
// History polling and background AI requests deliberately do not renew it.
export default function useSessionPresence() {
  useEffect(() => {
    let working = false;
    let stopped = false;
    const controller = new AbortController();
    async function heartbeat() {
      if (stopped || working || document.visibilityState !== "visible" || !document.hasFocus() || !navigator.onLine) return;
      working = true;
      const attempt = new AbortController();
      const cancel = () => attempt.abort();
      controller.signal.addEventListener("abort", cancel, { once: true });
      const timeout = window.setTimeout(cancel, 15000);
      try {
        const response = await fetch("/api/session", { method: "POST", cache: "no-store", signal: attempt.signal });
        if (!stopped && response.status === 401) window.location.replace("/login?expired=1");
      } catch { /* Offline or suspended: never invent a fresh lease in the browser. */ }
      finally { working = false; window.clearTimeout(timeout); controller.signal.removeEventListener("abort", cancel); }
    }
    void heartbeat();
    const timer = window.setInterval(heartbeat, 30000);
    window.addEventListener("focus", heartbeat);
    window.addEventListener("online", heartbeat);
    window.addEventListener("pageshow", heartbeat);
    document.addEventListener("visibilitychange", heartbeat);
    return () => {
      stopped = true; controller.abort(); window.clearInterval(timer);
      window.removeEventListener("focus", heartbeat);
      window.removeEventListener("online", heartbeat);
      window.removeEventListener("pageshow", heartbeat);
      document.removeEventListener("visibilitychange", heartbeat);
    };
  }, []);
}