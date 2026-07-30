/* ============================================================
   TESUJI — Shared Utilities
   Used by all pages: judge, admin, results
   ============================================================ */

// ─── HTML Escape ──────────────────────────────────────────────
// esc() is correct for HTML TEXT and for QUOTED ATTRIBUTE VALUES — and for
// nothing else. In particular it is NOT enough inside an inline handler:
//
//   onclick="fn('${esc(v)}')"        ← NEVER do this
//
// The parser entity-decodes an attribute value BEFORE compiling its body as JS,
// so esc()'s &#39; turns back into a real apostrophe and closes the JS string —
// a player name or division id becomes executable code. Emit data-act + data-*
// instead and let the delegated dispatcher below call the function; dataset
// hands back the decoded original string verbatim, so esc() is sufficient there.
function esc(s) {
  if (s == null) return '';
  return s.toString()
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── Locale helper ───────────────────────────────────────────
// window.__LIVE_LANG is set ONLY by the /live shell (app/live/route.ts BOOT,
// from the same `locale` cookie the React app writes). The judge page never
// sets it, so every _L() call there returns the Thai value — the judge console
// stays Thai by construction and judge.js needs no changes.
function _L(th, en) {
  return (window.__LIVE_LANG === 'en' && en != null) ? en : th;
}

/** Schedule-event label in the active language. `labelEn` is additive on the
 *  snapshot payload (lib/live/serverData.ts); older cached payloads without it
 *  fall back to the Thai label. */
function _evLabel(ev) {
  return _L(ev.label, ev.labelEn);
}

// ─── Delegated click actions ─────────────────────────────────
// One document-level listener, so it survives the innerHTML re-render every
// poll does — there is nothing to re-attach. closest() resolves to the INNERMOST
// [data-act], which reproduces the event.stopPropagation() that nested buttons
// (e.g. the card actions inside a clickable row) used to need.
// Click only: `oninput`/`onchange` handlers are untouched, and are safe as long
// as they take no interpolated argument.
const _actions = Object.create(null);

/** Register { name: (dataset, el, event) => … } handlers for data-act="name". */
function registerActions(actions) {
  Object.assign(_actions, actions);
}

// CAPTURE phase (the trailing `true`) — this is load-bearing, not a style choice.
// Several overlays carry onclick="event.stopPropagation()" (the results modal,
// the follow sheet, the history/help/schedule sheets), which kills bubbling
// before it can reach document. An inline onclick on the element itself used to
// run in the target phase and was immune; capture runs before any of those
// ancestors, so it is immune too. With bubbling, every control inside those
// overlays would silently do nothing.
document.addEventListener('click', function (e) {
  const t = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
  if (!t) return;
  const fn = _actions[t.dataset.act];
  if (fn) fn(t.dataset, t, e);
}, true);

// ─── Theme Toggle ─────────────────────────────────────────────
function toggleTheme() {
  const isLight = document.body.classList.toggle('light');
  localStorage.setItem('tesuji-theme', isLight ? 'light' : 'dark');
  _updateThemeBtn();
}

function _updateThemeBtn() {
  const btn = document.getElementById('btnTheme');
  if (btn) btn.textContent = document.body.classList.contains('light') ? '🌙' : '☀️';
}

(function initTheme() {
  if (localStorage.getItem('tesuji-theme') === 'light') document.body.classList.add('light');
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _updateThemeBtn);
  } else {
    _updateThemeBtn();
  }
})();

// ─── Constants ────────────────────────────────────────────────
const RESULT_PENDING = '?-?';
const RESULT_BLACK_WIN = '1-0';
const RESULT_WHITE_WIN = '0-1';

// ─── Schedule Data ───────────────────────────────────────────
// Populated from the FULL_UPDATE payload (real tournament schedule — see
// buildLiveSchedule() in lib/live/serverData.ts), not hardcoded. `window.` is
// used (not `const`/`let`) so results.js / judge.js can reassign it on every
// poll, the same way _scheduleMap / _tournamentDate below are shared.
window.SCHEDULE = [];
const SCHEDULE_COLORS = ['#818cf8', '#34d399', '#fbbf24', '#f472b6', '#38bdf8', '#fb7185'];

function _parseTime(str) {
  const [h, m] = str.split(':').map(Number);
  return h * 60 + m;
}

function _nowTH() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
}

function _nowMinutes() {
  const n = _nowTH();
  return n.getHours() * 60 + n.getMinutes();
}

function _eventStatus(ev) {
  if (!_isTournamentDay()) return 'future';
  const now = _nowMinutes();
  const start = _parseTime(ev.start);
  const end = ev.end ? _parseTime(ev.end) : start + 30;
  if (now >= end) return 'past';
  if (now >= start) return 'active';
  return 'future';
}

function _findNextEvent(divs) {
  const now = _nowMinutes();
  let best = null;
  for (const div of divs) {
    for (const ev of div.events) {
      const start = _parseTime(ev.start);
      if (start > now && (!best || start < best.start)) {
        best = { label: _evLabel(ev), divName: div.name, start, startStr: ev.start };
      }
    }
  }
  return best;
}

function _formatCountdown(diffMin) {
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  if (h > 0) return _L(`${h} ชม. ${m} นาที`, `${h} hr ${m} min`);
  return _L(`${m} นาที`, `${m} min`);
}

let _scheduleInterval = null;

// ─── Round Timer ──────────────────────────────────────────────
window._scheduleMap = {};
window._tournamentDate = '';
// State is stored per-element (el._timerDivId, el._timerInterval) — supports multiple instances

function _formatThaiDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const months = _L(
    ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
     'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'],
    ['January','February','March','April','May','June',
     'July','August','September','October','November','December']);
  return `${d} ${months[m-1]} ${y}`;
}

function _isTournamentDay() {
  if (!window._tournamentDate) return true;
  const n = _nowTH();
  const today = `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`;
  return today === window._tournamentDate;
}
function _nowTHSeconds() {
  const n = _nowTH();
  return n.getHours() * 3600 + n.getMinutes() * 60 + n.getSeconds();
}

function _getRoundTimerData(divId) {
  if (!_isTournamentDay()) return { state: 'not_today', date: window._tournamentDate };
  const map = window._scheduleMap || {};
  const raw = map[divId];
  if (raw === undefined || raw === null || raw === '') return null;
  const sch = SCHEDULE[parseInt(raw)];
  if (!sch) return null;

  const nowSec = _nowTHSeconds();

  for (const ev of sch.events) {
    const startSec = _parseTime(ev.start) * 60;
    const endSec = ev.end ? _parseTime(ev.end) * 60 : null;

    if (endSec !== null && nowSec >= startSec && nowSec < endSec) {
      const total = endSec - startSec;
      return {
        state: 'active', label: _evLabel(ev), type: ev.type || 'match',
        remaining: Math.max(0, endSec - nowSec),
        pct: Math.round(((endSec - nowSec) / total) * 100),
      };
    }
    if (endSec === null && nowSec >= startSec) {
      return { state: 'active', label: _evLabel(ev), type: ev.type || 'match', remaining: null, pct: null };
    }
    if (nowSec < startSec) {
      return { state: 'waiting', label: _evLabel(ev), type: ev.type || 'match', startStr: ev.start, waiting: startSec - nowSec };
    }
  }
  return { state: 'done' };
}

function _fmtSec(sec) {
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function renderRoundTimer(containerId, divId) {
  const container = typeof containerId === 'string'
    ? document.getElementById(containerId) : containerId;
  if (!container) return;

  if (container._timerDivId === divId && container._timerInterval) return;

  if (container._timerInterval) { clearInterval(container._timerInterval); container._timerInterval = null; }
  container._timerDivId = divId;
  if (!divId) { container.innerHTML = ''; return; }

  function update() {
    if (!document.contains(container)) {
      clearInterval(container._timerInterval);
      container._timerInterval = null;
      return;
    }
    const data = _getRoundTimerData(divId);
    if (!data) { container.innerHTML = ''; return; }

    if (data.state === 'not_today') {
      container.innerHTML = `<div class="rtimer rtimer-waiting">
        <div class="rtimer-row"><span class="rtimer-icon">📅</span><span class="rtimer-label">${_L('วันแข่งขัน:', 'Competition day:')} ${_formatThaiDate(data.date)}</span></div>
      </div>`;
      clearInterval(container._timerInterval); container._timerInterval = null;
      return;
    }
    if (data.state === 'done') {
      container.innerHTML = `<div class="rtimer rtimer-done"><span>✅</span><span class="rtimer-label">${_L('จบกิจกรรมทั้งหมดแล้ว', 'All events finished')}</span></div>`;
      clearInterval(container._timerInterval); container._timerInterval = null;
      return;
    }

    const icon = data.type === 'break' ? '🍽️' : data.type === 'ceremony' ? '🏆' : '⚔️';

    if (data.state === 'active') {
      const isBreak = data.type === 'break';
      const isCeremony = data.remaining === null;
      const veryUrgent = !isCeremony && data.remaining <= 60;
      const urgent = !veryUrgent && !isCeremony && data.remaining <= 300;
      const urgentCls = veryUrgent ? ' rtimer-very-urgent' : (urgent ? ' rtimer-urgent' : '');
      const typeCls = isBreak ? ' rtimer-break' : '';
      const badgeText = isBreak
        ? _L('พักกลางวัน', 'Lunch break')
        : isCeremony ? _L('กำลังดำเนินการ', 'In progress') : _L('กำลังแข่ง', 'Playing');
      const badgeCls = isBreak ? 'rtimer-badge-break' : (isCeremony ? 'rtimer-badge-ceremony' : 'rtimer-badge');
      let progressHTML = '';
      if (!isCeremony) {
        const tCls = veryUrgent ? 'rtimer-time-red' : (urgent ? 'rtimer-time-yellow' : 'rtimer-time-green');
        const fCls = veryUrgent ? 'fill-red' : (urgent ? 'fill-yellow' : 'fill-green');
        progressHTML = `<div class="rtimer-progress-wrap">
          <div class="rtimer-progress-track"><div class="rtimer-progress-fill ${fCls}" style="width:${data.pct}%"></div></div>
          <span class="rtimer-time ${tCls}">${_fmtSec(data.remaining)}</span>
        </div>`;
      }
      container.innerHTML = `<div class="rtimer rtimer-active${typeCls}${urgentCls}">
        <div class="rtimer-row"><span class="rtimer-icon">${icon}</span><span class="rtimer-label">${esc(data.label)}</span><span class="${badgeCls}">${badgeText}</span></div>
        ${progressHTML}</div>`;
    } else {
      container.innerHTML = `<div class="rtimer rtimer-waiting">
        <div class="rtimer-row"><span class="rtimer-icon">${icon}</span><span class="rtimer-label">${esc(data.label)}</span><span class="rtimer-badge-wait">${esc(data.startStr)}${_L(' น.', '')}</span></div>
        <div class="rtimer-sub">${_L('เริ่มใน', 'Starts in')} <span class="rtimer-time-wait">${_fmtSec(data.waiting)}</span></div>
      </div>`;
    }
  }

  update();
  container._timerInterval = setInterval(update, 1000);
}

function _getScheduledDivs(divId) {
  const map = window._scheduleMap || {};

  if (divId) {
    const idx = parseInt(map[divId]);
    if (!isNaN(idx) && SCHEDULE[idx]) return [SCHEDULE[idx]];
  }

  const mappedIndices = new Set(Object.values(map).map(Number).filter(n => !isNaN(n)));
  return mappedIndices.size > 0
    ? SCHEDULE.filter((_, i) => mappedIndices.has(i))
    : SCHEDULE;
}

function renderSchedule(containerId, divId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  function update() {
    const divs = _getScheduledDivs(divId);
    const now = _nowTH();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const clockHTML = `<div class="sch-clock">${hh}:${mm}</div>`;

    const dateHTML = window._tournamentDate
      ? `<div class="sch-date">📅 ${_formatThaiDate(window._tournamentDate)}</div>`
      : '';

    let countdownHTML = '';
    if (!_isTournamentDay()) {
      countdownHTML = `<div class="sch-countdown sch-countdown-future">
        <span class="sch-countdown-icon">🗓️</span>
        <span>${_L('ยังไม่ถึงวันแข่งขัน', 'Competition day hasn’t arrived yet')}</span>
      </div>`;
    } else {
      const next = _findNextEvent(divs);
      if (next) {
        const diff = next.start - _nowMinutes();
        countdownHTML = `<div class="sch-countdown">
          <span class="sch-countdown-icon">⏱</span>
          <span>${_L('ถัดไป:', 'Next:')} <strong>${esc(next.label)}</strong> (${esc(next.divName)}) ${_L('ใน', 'in')} <strong>${_formatCountdown(diff)}</strong></span>
        </div>`;
      } else {
        countdownHTML = `<div class="sch-countdown sch-countdown-done">
          <span class="sch-countdown-icon">✅</span>
          <span>${_L('จบกิจกรรมทั้งหมดแล้ว', 'All events finished')}</span>
        </div>`;
      }
    }

    const divsHTML = divs.map((div, i) => {
      const color = SCHEDULE_COLORS[i % SCHEDULE_COLORS.length];
      const eventsHTML = div.events.map(ev => {
        const status = _eventStatus(ev);
        const timeStr = ev.end ? `${esc(ev.start)} - ${esc(ev.end)}` : `${esc(ev.start)}${_L(' น.', '')}`;
        const icon = ev.type === 'break' ? '🍽️' : ev.type === 'ceremony' ? '🏆' : '⚫';
        const statusBadge = status === 'active'
          ? `<span class="sch-badge-active">${_L('กำลังแข่ง', 'Playing')}</span>`
          : status === 'past' ? '<span class="sch-badge-past">✓</span>' : '';
        return `<div class="sch-event sch-${status}">
          <div class="sch-time">${timeStr}</div>
          <div class="sch-dot" style="--dot-color:${color}"></div>
          <div class="sch-info">
            <span class="sch-ev-icon">${icon}</span>
            <span class="sch-ev-label">${esc(_evLabel(ev))}</span>
            ${statusBadge}
          </div>
        </div>`;
      }).join('');

      return `<div class="sch-division">
        <div class="sch-div-header" style="--div-color:${color}">
          <span class="sch-div-icon">⚔️</span>
          <span class="sch-div-name">${esc(div.name)}</span>
        </div>
        <div class="sch-events">${eventsHTML}</div>
      </div>`;
    }).join('');

    container.innerHTML = clockHTML + dateHTML + countdownHTML + divsHTML;
  }

  update();
  if (_scheduleInterval) clearInterval(_scheduleInterval);
  _scheduleInterval = setInterval(update, 30000);
}
