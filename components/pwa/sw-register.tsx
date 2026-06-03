"use client";

import { useEffect } from "react";

/**
 * Registers the service worker (public/sw.js) in production only.
 *
 * In development the SW is disabled: we actively unregister any worker left
 * over from a production visit so dev navigations are never served from cache.
 * Mounted once in the root layout.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((r) => r.unregister());
      });
      return;
    }

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Registration failures are non-fatal: the app works without the SW.
      });
    };

    // Register after load so it never competes with first paint.
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}
