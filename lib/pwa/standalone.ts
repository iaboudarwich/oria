/**
 * Standalone (installed PWA) detection.
 *
 * True when the app runs from the home screen rather than a browser tab:
 *  - Android / desktop Chromium: the `display-mode: standalone` media query.
 *  - iOS Safari: the non-standard `navigator.standalone` flag.
 *
 * Note on iOS push: Web Push on iOS only works when the app has been added to
 * the Home Screen (installed) AND the device is on iOS 16.4 or later. In a
 * regular iOS Safari tab, push is unavailable regardless of permission. Use
 * this helper to gate the push opt-in messaging on iOS.
 */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const mq = window.matchMedia?.("(display-mode: standalone)").matches ?? false;
  const iosStandalone =
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return mq || iosStandalone;
}

/** True for iOS Safari (where there is no beforeinstallprompt). */
export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iOSDevice = /iPad|iPhone|iPod/.test(ua);
  // iPadOS 13+ reports as Mac; detect via touch points.
  const iPadOS = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return iOSDevice || iPadOS;
}
