// Renders the v1 results.html shell for /live/[tid] as a raw Route Handler
// response (the reference/tesuji-v1 tree it was copied from is not in this
// repository; this file is the markup of record) — this bypasses app/layout.tsx entirely, so
// there is no PublicHeader / GlassDock / any reg-app chrome on this page. Only
// the asset paths were repointed to /live-assets/*; markup, classes, and modal
// structure are untouched. Client logic lives in public/live-assets/results.js,
// which talks to /live/events (Supabase-backed SSE) instead of the old /api/events.
//
// i18n: the shell is rendered per request in the locale from the same `locale`
// cookie the React app's I18nProvider writes, so /live and the main site stay
// in sync. Strings come from the shared dictionary's `live` namespace; the
// client JS reads window.__LIVE_LANG (set below) and localizes its own strings
// via _L() in common.js. force-dynamic + no-store make cookie-varying HTML safe.

import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  isLocale,
  type Locale,
} from "@/lib/i18n/config";
import { dictionaries } from "@/lib/i18n/dictionaries";


export function localeFromCookie(cookieHeader: string | null): Locale {
  const m = cookieHeader?.match(
    new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=([^;]+)`),
  );
  // No decodeURIComponent: the app only ever writes literal th/en, the raw
  // read matches app/layout.tsx's cookies().get(), and a malformed %-sequence
  // in a tampered cookie would make decoding throw (500ing /live forever).
  const value = m ? m[1] : null;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

// Public Supabase URL + anon/publishable key, injected as window globals so
// results.js can read the visitor's own reg-app session (same pattern as
// app/judge/[key]/route.ts) and fetch their managed_player roster to offer
// "follow my students". JSON-encoded and </-escaped for safe inline <script>.
// __LIVE_LANG drives _L() in the live-assets JS; the judge page never sets it,
// so the judge console stays Thai by construction.
// One JSON literal safe to drop into an inline <script> (guards against
// </script> closing the block early).
//
// The globals are assigned with a SINGLE Object.assign statement on purpose.
// The previous version concatenated one `window.__X=${…};` template per global
// with `+`, and the production minifier folded those literals together while
// dropping the `;` that terminated each statement — so the shipped block read
// `…="url"window.__SUPABASE_KEY=…` and died with
// `Unexpected identifier 'window'`. window.__LIVE_TID then never got set,
// results.js fell back to the unscoped /live/snapshot (now a 400), and the
// board sat on "ข้อมูลค้าง" forever while the data behind it was fine.
// One statement needs no separators, so there is nothing left to drop.
function jsLiteral(v: unknown): string {
  return JSON.stringify(v).replace(/</g, "\\u003c");
}

function boot(locale: Locale, tid: string | null): string {
  return `<script>Object.assign(window,${jsLiteral({
    __SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    __SUPABASE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      "",
    __LIVE_LANG: locale,
    // Scopes results.js's snapshot polls to this tournament's board.
    __LIVE_TID: tid,
  })})</script>`;
}

/** The judge console's boot block (app/judge/[key]/route.ts). It lives here,
 *  next to the board's, because it was written the same broken way — one
 *  `window.__X=${…};` template per global, joined with `+` — and survived only
 *  because the minifier happened not to fold it. Same single-statement shape,
 *  same test (lib/live/shell.test.ts), so the next SWC release cannot quietly
 *  blank the console the way it blanked the board.
 *
 *  The console reads exactly these four: judge.js has no use for the
 *  tournament NAME (the header renders it as markup), so it is not injected. */
export function judgeBoot(key: string, tournamentId: string): string {
  return `<script>Object.assign(window,${jsLiteral({
    __JUDGE_SECRET: key,
    __LIVE_TID: tournamentId,
    __SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    __SUPABASE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      "",
  })})</script>`;
}

export function renderLivePage(locale: Locale, tid: string | null): string {
  const L = dictionaries[locale].live;
  // The `live` namespace has no page-title string of its own; nav.live is the
  // same board's label everywhere else in the app, so the tab matches the link
  // the visitor tapped to get here.
  const pageTitle = dictionaries[locale].nav.live;
  // The toggle badge shows the TARGET language (tap to switch to it).
  const langBadge = locale === "en" ? "ไทย" : "EN";
  return `<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TESUJI — ${pageTitle}</title>
  <meta name="description" content="${L.metaDescription}">
  <!-- The board is competitors' full names, often minors' — the same reason
       robots.ts keeps participant lists out of the index. This shell bypasses
       app/layout.tsx, so the tag is written by hand here. -->
  <meta name="robots" content="noindex, nofollow">
  <!-- Hand-written because this shell bypasses app/layout.tsx, so Next's
       file-based metadata (app/icon.png, app/apple-icon.png, app/manifest.ts)
       is never injected here — without these the board shows a blank favicon
       and can't be installed to the home screen. -->
  <link rel="icon" href="/icon.png">
  <link rel="apple-touch-icon" href="/apple-icon.png">
  <!-- Deliberately NO <link rel="manifest">: app/manifest.ts declares
       start_url and scope "/", so installing this page to a home screen
       produced an app that launched the registration site instead of the board
       it was installed from. The apple-mobile-web-app tags above already give
       iOS a standalone launch, and without a manifest Android adds a plain
       shortcut to THIS url — which is what someone installing a judge link or a
       tournament board actually wants. -->
  <link rel="stylesheet" href="/live-assets/shared.css">
  <link rel="stylesheet" href="/live-assets/results.css">
</head>
<body class="results-page">

  <!-- Back to main app -->
  <div class="results-back-btn">
    <a class="btn-back" href="${tid ? `/t/${tid}` : "/"}" title="${L.backHomeTitle}">← ${L.backHome}</a>
  </div>

  <!-- Theme Toggle -->
  <div class="results-theme-btn">
    <button class="btn-theme" id="btnTheme" onclick="toggleTheme()" aria-label="${L.themeToggleTitle}" title="${L.themeToggleTitle}">☀️</button>
  </div>

  <div class="header">
    <div class="logo">
      <span class="app-logo app-logo-lg"><img src="/logo-mark.svg" alt=""></span>
    </div>
    <h1>TESUJI</h1>
    <div class="subtitle">Go Competition Organizer</div>
    <div class="header-badges">
      <!-- results.js drives this from the poll outcome (live / reconnecting /
           stale + last-updated clock); it is not a decoration. -->
      <div class="live-badge" id="liveBadge">
        <span class="live-dot"></span>
        <span id="liveBadgeText">LIVE</span>
      </div>
      <button class="schedule-badge" onclick="openScheduleModal()">📅 ${L.badgeSchedule}</button>
      <button class="schedule-badge" id="mapBadge" onclick="openMapModal()" style="display:none">🗺️ ${L.badgeMap}</button>
      <button class="schedule-badge" onclick="openHelpModal()">💡 ${L.badgeHelp}</button>
      <button class="schedule-badge" id="btnLang" onclick="toggleLiveLang()">🌐 ${langBadge}</button>
    </div>
  </div>

  <!-- Announcement Banner -->
  <div id="announcementBanner" class="announcement-banner hidden"></div>

  <!-- Roster prompt: offers a signed-in coach to follow their matched students -->
  <div id="rosterBanner" class="roster-banner hidden"></div>

  <!-- My Status Card (shown when subscribed) -->
  <div class="my-card" id="myCard" style="display:none"></div>

  <div class="links-container" id="linksContainer">
    <div class="loading">${L.loading}</div>
  </div>

  <!-- Toast Container -->
  <div class="toast-wrap" id="toastWrap"></div>

  <!-- Subscribe FAB -->
  <button class="sub-fab" id="subFab" onclick="openSubModal()" aria-label="${L.subFabTitle}" title="${L.subFabTitle}">🔔<span class="fab-badge" id="fabBadge" style="display:none"></span></button>

  <div class="footer">
    <p>Powered by <a href="/">TESUJI</a></p>
  </div>

  <!-- Modal. Every sheet below is a real dialog for assistive tech: role +
       aria-modal + aria-labelledby pointing at the heading already there, and
       an accessible name on each ✕ (its only content is a glyph, which reads
       as "multiplication x" or as nothing at all). The name reuses
       live.mapCloseTitle ("ปิด" / "Close") rather than adding a dictionary key
       from here — lib/i18n/dictionaries is owned elsewhere. -->
  <div class="modal-overlay" id="modalOverlay" onclick="closeModal(event)">
    <div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="modalTitle" onclick="event.stopPropagation()">
      <div class="modal-handle"></div>
      <div class="modal-header">
        <h2 id="modalTitle" class="modal-title"></h2>
        <button class="modal-close" aria-label="${L.mapCloseTitle}" onclick="closeModal()">✕</button>
      </div>
      <div class="modal-view-toggle" id="modalViewToggle"></div>
      <div class="round-selector" id="roundSelector"></div>
      <div class="table-container" id="modalTableWrap">
        <table>
          <thead id="modalThead">
            <tr>
              <th class="td-center">${L.thTable}</th>
              <th>${L.thName}</th>
              <th class="td-center">${L.thResult}</th>
              <th class="td-right">${L.thName}</th>
            </tr>
          </thead>
          <tbody id="modalBody"></tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- Subscribe Modal -->
  <div class="sub-overlay" id="subOverlay" onclick="closeSubModal(event)">
    <div class="sub-sheet" role="dialog" aria-modal="true" aria-labelledby="subTitle" onclick="event.stopPropagation()">
      <div class="sub-handle"></div>
      <div class="sub-header">
        <button class="sub-back" id="subBackBtn" onclick="subGoBack()" style="display:none" aria-label="${L.subBackTitle}" title="${L.subBackTitle}">←</button>
        <div class="sub-title" id="subTitle">${L.subTitle}</div>
        <button class="sub-close" aria-label="${L.mapCloseTitle}" onclick="closeSubModal()">✕</button>
      </div>
      <input class="sub-search" id="subSearch" placeholder="${L.subSearchPlaceholder}" oninput="filterSubList()" style="display:none">
      <div class="sub-step-label" id="subStepLabel">${L.subStepDivision}</div>
      <div class="sub-list" id="subList"></div>
    </div>
  </div>

  <!-- History Modal -->
  <div class="hist-overlay" id="histOverlay" onclick="closeHistModal(event)">
    <div class="hist-sheet" role="dialog" aria-modal="true" aria-labelledby="histTitle" onclick="event.stopPropagation()">
      <div class="hist-handle"></div>
      <div class="hist-header">
        <div class="hist-title" id="histTitle">${L.histTitle}</div>
        <button class="hist-close" aria-label="${L.mapCloseTitle}" onclick="closeHistModal()">✕</button>
      </div>
      <div class="hist-body" id="histBody"></div>
    </div>
  </div>

  <!-- Help Modal -->
  <div class="help-overlay" id="helpOverlay" onclick="closeHelpModal(event)">
    <div class="help-sheet" role="dialog" aria-modal="true" aria-labelledby="helpTitle" onclick="event.stopPropagation()">
      <div class="help-handle"></div>
      <div class="help-header">
        <div class="help-title" id="helpTitle">${L.helpTitle}</div>
        <button class="help-close" aria-label="${L.mapCloseTitle}" onclick="closeHelpModal()">✕</button>
      </div>
      <div class="help-body">
        <div class="help-section">
          <div class="help-icon">📊</div>
          <div class="help-text">
            <div class="help-heading">${L.helpViewHeading}</div>
            <div class="help-desc">${L.helpViewDesc}</div>
          </div>
        </div>
        <div class="help-section">
          <div class="help-icon">🔔</div>
          <div class="help-text">
            <div class="help-heading">${L.helpFollowHeading}</div>
            <div class="help-desc">${L.helpFollowDesc}</div>
          </div>
        </div>
        <div class="help-section">
          <div class="help-icon">📅</div>
          <div class="help-text">
            <div class="help-heading">${L.helpScheduleHeading}</div>
            <div class="help-desc">${L.helpScheduleDesc}</div>
          </div>
        </div>
        <div class="help-section" id="helpMapSection" style="display:none">
          <div class="help-icon">🗺️</div>
          <div class="help-text">
            <div class="help-heading">${L.helpMapHeading}</div>
            <div class="help-desc">${L.helpMapDesc}</div>
          </div>
        </div>
        <div class="help-section">
          <div class="help-icon">📜</div>
          <div class="help-text">
            <div class="help-heading">${L.helpHistoryHeading}</div>
            <div class="help-desc">${L.helpHistoryDesc}</div>
          </div>
        </div>
        <button class="help-dismiss" onclick="closeHelpModal()">${L.helpDismiss}</button>
      </div>
    </div>
  </div>

  <!-- Schedule Modal -->
  <div class="modal-overlay" id="scheduleOverlay" onclick="closeScheduleModal(event)">
    <div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="scheduleTitle" onclick="event.stopPropagation()" style="max-height:92vh">
      <div class="modal-handle"></div>
      <div class="modal-header">
        <h2 class="modal-title" id="scheduleTitle">${L.scheduleModalTitle}</h2>
        <button class="modal-close" aria-label="${L.mapCloseTitle}" onclick="closeScheduleModal()">✕</button>
      </div>
      <div class="table-container" style="padding:14px 16px 28px">
        <div id="scheduleContainer"></div>
      </div>
    </div>
  </div>

  <!-- Venue Map (แผนผังงาน) full-screen viewer -->
  <div class="map-overlay" id="mapOverlay" role="dialog" aria-modal="true" aria-labelledby="mapTitle">
    <div class="map-topbar">
      <div class="map-title" id="mapTitle">${L.mapTitle}</div>
      <button class="map-close" aria-label="${L.mapCloseTitle}" onclick="closeMapModal()" title="${L.mapCloseTitle}">✕</button>
    </div>
    <div class="map-stage" id="mapStage">
      <div class="map-loading" id="mapLoading" style="display:none"></div>
      <img id="mapImg" alt="${L.mapAlt}" draggable="false">
    </div>
    <div class="map-hint" id="mapHint">${L.mapHint}</div>
  </div>

  ${boot(locale, tid)}
  <!-- ?v= is bumped whenever the pair changes together: results.js now calls
       registerActions() from common.js, so a cached old common.js would leave
       every delegated button dead. Bump both on any future change to either.
       v3: _L() locale helper added to common.js + localized results.js.
       v4: results.js scopes snapshot polls via window.__LIVE_TID.
       v5: results.js reports connection state on the LIVE badge, pauses
           polling on a hidden tab, and backs off on failures.
       v6: results.js only shows/toasts followed players whose division is
           on THIS tournament's board (boards are per tournament now).
       v7: common.js gained the _ls* guarded-storage helpers results.js now
           depends on at load time, and the sheets became keyboard-operable
           (focus move + Escape).
       v8: the division tile's badge shows the MacMahon code ('01'), not the
           internal division id, which stopped being the code when boards
           became per-tournament ('d70bed1e-01'). -->
  <script src="/live-assets/common.js?v=8"></script>
  <script src="/live-assets/results.js?v=8"></script>
</body>
</html>
`;
}

