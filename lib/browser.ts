// In-app / problem browser detection + escape hatches.
//
// Two browsers lose the slip upload mid-registration by killing/reloading the
// page during the native photo-picker round-trip, which drops the in-memory
// File (and often sessionStorage) before onChange ever fires:
//
//   • The LINE Android webview. LINE's in-app UA always contains "Line/x.y.z",
//     and LINE intercepts the documented `openExternalBrowser=1` query param
//     to open the URL in the system browser.
//   • Samsung Internet (UA "SamsungBrowser/x.y"). At the 2026-10-10 opening
//     every Samsung Internet registrant reached the payment page and none
//     produced a single storage POST (5 users, 25 reservations), while the
//     same people succeeded on Chrome minutes later. It is the default browser
//     on Galaxy phones, so LINE's "open externally" lands there too — the
//     escape from one trap leads into the other. Android's intent: scheme can
//     name a package, so the way out is a link that opens Chrome specifically.

export function isLineInAppBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /\bLine\//i.test(navigator.userAgent);
}

export function isSamsungInternet(): boolean {
  if (typeof navigator === "undefined") return false;
  return /\bSamsungBrowser\//i.test(navigator.userAgent);
}

/** Current URL with openExternalBrowser=1 appended (existing params, e.g.
 *  ?batch=…, are preserved). Only meaningful inside the LINE app; inert
 *  elsewhere. */
export function externalBrowserUrl(): string {
  const url = new URL(window.location.href);
  url.searchParams.set("openExternalBrowser", "1");
  return url.toString();
}

/** Android intent URL that opens `href` in Chrome (package com.android.chrome),
 *  falling back to the plain URL when Chrome is not installed. The fragment of
 *  `href` cannot survive (the intent syntax lives in the fragment); nothing in
 *  the register flow uses one. */
export function chromeIntentUrl(href: string = window.location.href): string {
  const url = new URL(href);
  const scheme = url.protocol.replace(/:$/, "");
  const fallback = encodeURIComponent(url.toString());
  return (
    `intent://${url.host}${url.pathname}${url.search}` +
    `#Intent;scheme=${scheme};package=com.android.chrome;` +
    `S.browser_fallback_url=${fallback};end`
  );
}
