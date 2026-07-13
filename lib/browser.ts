// LINE in-app browser detection + escape hatch.
//
// The LINE Android webview frequently kills/reloads the page during the native
// photo-picker round-trip, losing in-memory state (and often sessionStorage) —
// which breaks the slip upload mid-registration. LINE's in-app UA always
// contains "Line/x.y.z", and LINE intercepts the documented
// `openExternalBrowser=1` query param to open the URL in the system browser.

export function isLineInAppBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /\bLine\//i.test(navigator.userAgent);
}

/** Current URL with openExternalBrowser=1 appended (existing params, e.g.
 *  ?batch=…, are preserved). Only meaningful inside the LINE app; inert
 *  elsewhere. */
export function externalBrowserUrl(): string {
  const url = new URL(window.location.href);
  url.searchParams.set("openExternalBrowser", "1");
  return url.toString();
}
