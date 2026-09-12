// Renders the v1 results.html shell for /live/[tid] (see reference/tesuji-v1/public/results.html)
// as a raw Route Handler response — this bypasses app/layout.tsx entirely, so
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
  <!-- Hand-written because this shell bypasses app/layout.tsx, so Next's
       file-based metadata (app/icon.png, app/apple-icon.png, app/manifest.ts)
       is never injected here — without these the board shows a blank favicon
       and can't be installed to the home screen. -->
  <link rel="icon" href="/icon.png">
  <link rel="apple-touch-icon" href="/apple-icon.png">
  <link rel="manifest" href="/manifest.webmanifest">
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
    <button class="btn-theme" id="btnTheme" onclick="toggleTheme()" title="${L.themeToggleTitle}">☀️</button>
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
  <button class="sub-fab" id="subFab" onclick="openSubModal()" title="${L.subFabTitle}">🔔<span class="fab-badge" id="fabBadge" style="display:none"></span></button>

  <div class="footer">
    <p>Powered by <a href="/">TESUJI</a></p>
  </div>

  <!-- Modal -->
  <div class="modal-overlay" id="modalOverlay" onclick="closeModal(event)">
    <div class="modal-content" onclick="event.stopPropagation()">
      <div class="modal-handle"></div>
      <div class="modal-header">
        <h2 id="modalTitle" class="modal-title"></h2>
        <button class="modal-close" onclick="closeModal()">✕</button>
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
    <div class="sub-sheet" onclick="event.stopPropagation()">
      <div class="sub-handle"></div>
      <div class="sub-header">
        <button class="sub-back" id="subBackBtn" onclick="subGoBack()" style="display:none" title="${L.subBackTitle}">←</button>
        <div class="sub-title" id="subTitle">${L.subTitle}</div>
        <button class="sub-close" onclick="closeSubModal()">✕</button>
      </div>
      <input class="sub-search" id="subSearch" placeholder="${L.subSearchPlaceholder}" oninput="filterSubList()" style="display:none">
      <div class="sub-step-label" id="subStepLabel">${L.subStepDivision}</div>
      <div class="sub-list" id="subList"></div>
    </div>
  </div>

  <!-- History Modal -->
  <div class="hist-overlay" id="histOverlay" onclick="closeHistModal(event)">
    <div class="hist-sheet" onclick="event.stopPropagation()">
      <div class="hist-handle"></div>
      <div class="hist-header">
        <div class="hist-title" id="histTitle">${L.histTitle}</div>
        <button class="hist-close" onclick="closeHistModal()">✕</button>
      </div>
      <div class="hist-body" id="histBody"></div>
    </div>
  </div>

  <!-- Help Modal -->
  <div class="help-overlay" id="helpOverlay" onclick="closeHelpModal(event)">
    <div class="help-sheet" onclick="event.stopPropagation()">
      <div class="help-handle"></div>
      <div class="help-header">
        <div class="help-title">${L.helpTitle}</div>
        <button class="help-close" onclick="closeHelpModal()">✕</button>
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
    <div class="modal-content" onclick="event.stopPropagation()" style="max-height:92vh">
      <div class="modal-handle"></div>
      <div class="modal-header">
        <h2 class="modal-title">${L.scheduleModalTitle}</h2>
        <button class="modal-close" onclick="closeScheduleModal()">✕</button>
      </div>
      <div class="table-container" style="padding:14px 16px 28px">
        <div id="scheduleContainer"></div>
      </div>
    </div>
  </div>

  <!-- Venue Map (แผนผังงาน) full-screen viewer -->
  <div class="map-overlay" id="mapOverlay">
    <div class="map-topbar">
      <div class="map-title">${L.mapTitle}</div>
      <button class="map-close" onclick="closeMapModal()" title="${L.mapCloseTitle}">✕</button>
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
           on THIS tournament's board (boards are per tournament now). -->
  <script src="/live-assets/common.js?v=6"></script>
  <script src="/live-assets/results.js?v=6"></script>
</body>
</html>
`;
}

