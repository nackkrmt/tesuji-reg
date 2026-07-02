/* ============================================================
   TESUJI — Shared Utilities
   Used by all pages: judge, admin, results
   ============================================================ */

// ─── HTML Escape ──────────────────────────────────────────────
function esc(s) {
  if (!s) return '';
  return s.toString()
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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
const SCHEDULE = [
  {
    name: '1-12 Kyu กระดาน 19x19',
    icon: '⚔️',
    color: '#818cf8',
    events: [
      { label: 'แข่งขันรอบที่ 1', start: '10:00', end: '11:00' },
      { label: 'แข่งขันรอบที่ 2', start: '11:10', end: '12:10' },
      { label: 'พักกลางวัน', start: '12:10', end: '13:10', type: 'break' },
      { label: 'แข่งขันรอบที่ 3', start: '13:10', end: '14:10' },
      { label: 'แข่งขันรอบที่ 4', start: '14:20', end: '15:20' },
      { label: 'แข่งขันรอบที่ 5', start: '15:30', end: '16:30' },
      { label: 'พิธีมอบรางวัล', start: '17:00', type: 'ceremony' },
    ]
  },
  {
    name: '9-15 Kyu กระดาน 9x9',
    icon: '🎯',
    color: '#34d399',
    events: [
      { label: 'แข่งขันรอบที่ 1', start: '10:00', end: '10:20' },
      { label: 'แข่งขันรอบที่ 2', start: '10:40', end: '11:00' },
      { label: 'แข่งขันรอบที่ 3', start: '11:10', end: '11:30' },
      { label: 'แข่งขันรอบที่ 4', start: '11:40', end: '12:00' },
      { label: 'แข่งขันรอบที่ 5', start: '12:10', end: '12:30' },
      { label: 'พิธีเปิดและมอบรางวัล', start: '12:30', type: 'ceremony' },
    ]
  },
  {
    name: '9-15 Kyu กระดาน 13x13',
    icon: '🏅',
    color: '#fbbf24',
    events: [
      { label: 'แข่งขันรอบที่ 1', start: '14:00', end: '14:20' },
      { label: 'แข่งขันรอบที่ 2', start: '14:40', end: '15:00' },
      { label: 'แข่งขันรอบที่ 3', start: '15:10', end: '15:30' },
      { label: 'แข่งขันรอบที่ 4', start: '15:40', end: '16:00' },
      { label: 'แข่งขันรอบที่ 5', start: '16:10', end: '16:30' },
      { label: 'พิธีมอบรางวัล', start: '17:00', type: 'ceremony' },
    ]
  },
  {
    name: 'กิจกรรมพิเศษ',
    icon: '🎁',
    color: '#f472b6',
    events: [
      { label: 'จับรางวัล', start: '16:40', type: 'ceremony' },
    ]
  }
];

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
        best = { label: ev.label, divName: div.name, start, startStr: ev.start };
      }
    }
  }
  return best;
}

function _formatCountdown(diffMin) {
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  if (h > 0) return `${h} ชม. ${m} นาที`;
  return `${m} นาที`;
}

let _scheduleInterval = null;

// ─── Round Timer ──────────────────────────────────────────────
window._scheduleMap = {};
window._tournamentDate = '';
// State is stored per-element (el._timerDivId, el._timerInterval) — supports multiple instances

function _formatThaiDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const months = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
                  'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
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
        state: 'active', label: ev.label, type: ev.type || 'match',
        remaining: Math.max(0, endSec - nowSec),
        pct: Math.round(((endSec - nowSec) / total) * 100),
      };
    }
    if (endSec === null && nowSec >= startSec) {
      return { state: 'active', label: ev.label, type: ev.type || 'match', remaining: null, pct: null };
    }
    if (nowSec < startSec) {
      return { state: 'waiting', label: ev.label, type: ev.type || 'match', startStr: ev.start, waiting: startSec - nowSec };
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
        <div class="rtimer-row"><span class="rtimer-icon">📅</span><span class="rtimer-label">วันแข่งขัน: ${_formatThaiDate(data.date)}</span></div>
      </div>`;
      clearInterval(container._timerInterval); container._timerInterval = null;
      return;
    }
    if (data.state === 'done') {
      container.innerHTML = `<div class="rtimer rtimer-done"><span>✅</span><span class="rtimer-label">จบกิจกรรมทั้งหมดแล้ว</span></div>`;
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
      const badgeText = isBreak ? 'พักกลางวัน' : isCeremony ? 'กำลังดำเนินการ' : 'กำลังแข่ง';
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
        <div class="rtimer-row"><span class="rtimer-icon">${icon}</span><span class="rtimer-label">${esc(data.label)}</span><span class="rtimer-badge-wait">${data.startStr} น.</span></div>
        <div class="rtimer-sub">เริ่มใน <span class="rtimer-time-wait">${_fmtSec(data.waiting)}</span></div>
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
        <span>ยังไม่ถึงวันแข่งขัน</span>
      </div>`;
    } else {
      const next = _findNextEvent(divs);
      if (next) {
        const diff = next.start - _nowMinutes();
        countdownHTML = `<div class="sch-countdown">
          <span class="sch-countdown-icon">⏱</span>
          <span>ถัดไป: <strong>${esc(next.label)}</strong> (${esc(next.divName)}) ใน <strong>${_formatCountdown(diff)}</strong></span>
        </div>`;
      } else {
        countdownHTML = `<div class="sch-countdown sch-countdown-done">
          <span class="sch-countdown-icon">✅</span>
          <span>จบกิจกรรมทั้งหมดแล้ว</span>
        </div>`;
      }
    }

    const divsHTML = divs.map(div => {
      const eventsHTML = div.events.map(ev => {
        const status = _eventStatus(ev);
        const timeStr = ev.end ? `${ev.start} - ${ev.end}` : `${ev.start} น.`;
        const icon = ev.type === 'break' ? '🍽️' : ev.type === 'ceremony' ? '🏆' : '⚫';
        const statusBadge = status === 'active'
          ? '<span class="sch-badge-active">กำลังแข่ง</span>'
          : status === 'past' ? '<span class="sch-badge-past">✓</span>' : '';
        return `<div class="sch-event sch-${status}">
          <div class="sch-time">${timeStr}</div>
          <div class="sch-dot" style="--dot-color:${div.color}"></div>
          <div class="sch-info">
            <span class="sch-ev-icon">${icon}</span>
            <span class="sch-ev-label">${esc(ev.label)}</span>
            ${statusBadge}
          </div>
        </div>`;
      }).join('');

      return `<div class="sch-division">
        <div class="sch-div-header" style="--div-color:${div.color}">
          <span class="sch-div-icon">${div.icon}</span>
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
