/* ============================================================
   TESUJI — Live Results Page Logic
   Requires: common.js loaded first
   ============================================================ */

let divData = {}, divMeta = [], standingsData = {};
let currentOpenDiv = null;
let selectedRound = null;
let modalView = 'pairings'; // 'pairings' | 'standings' — which tab of the division modal is shown
let expandedSubs = {};      // "divId|playerName" -> true : which followed-player rows are expanded
let myFilter = 'all';       // 'all' | 'playing' | 'done' : filter for the followed list
let mySearch = '';          // name filter for the followed list (shown from 5 followers up)

// ── Subscription state (array) ──
let subscriptions = JSON.parse(localStorage.getItem('tesuji_subs') || '[]');
const _old = localStorage.getItem('tesuji_sub');
if (_old) { try { const o = JSON.parse(_old); if (o && o.divId) { subscriptions.push(o); localStorage.setItem('tesuji_subs', JSON.stringify(subscriptions)); } } catch{} localStorage.removeItem('tesuji_sub'); }
let prevResults = {};
let subStep = 'div';
let subPickedDiv = null;

// ── Data transport ──
// v1 used a held-open SSE connection (`new EventSource('/api/events')`). That
// doesn't fit Vercel's serverless model (functions get killed at maxDuration),
// so instead the browser polls a short snapshot endpoint every 3s — same
// freshness as v1 (whose server also polled every 3s), but each request is a
// quick GET with no held-open function. ETag / 304 keeps unchanged polls cheap.
const POLL_MS = 3000;
let _snapshotEtag = null;

function applyUpdate(msg) {
  setAnnouncement(msg.announcement || '', !!msg.announcementUrgent, msg.announcementAt || '');
  setVenueMap(msg.venueMapUrl || '');
  const isFirst = Object.keys(prevResults).length === 0;
  divMeta = msg.divisions || [];
  divData = msg.divData || {};
  standingsData = msg.standings || {};
  const newMap = msg.scheduleMap || {};
  const newDate = msg.tournamentDate || '';
  if (JSON.stringify(newMap) !== JSON.stringify(window._scheduleMap) || newDate !== window._tournamentDate) {
    _roundTimerDivId = '__none__';
  }
  window._scheduleMap = newMap;
  window._tournamentDate = newDate;
  window.SCHEDULE = msg.schedule || [];
  renderLinks();
  if (currentOpenDiv) renderModal(currentOpenDiv);
  if (subscriptions.length > 0) {
    checkResultChanges(isFirst);
    renderMyCard();
  }
  updateRosterBanner();
}

async function pollSnapshot() {
  try {
    const res = await fetch('/live/snapshot', {
      cache: 'no-store',
      headers: _snapshotEtag ? { 'If-None-Match': _snapshotEtag } : {},
    });
    if (res.status === 304 || !res.ok) return; // unchanged, or transient error
    _snapshotEtag = res.headers.get('ETag');
    applyUpdate(await res.json());
  } catch (err) {}
}

pollSnapshot();
setInterval(pollSnapshot, POLL_MS);

// ── "Follow my students" — auto-match a signed-in coach's roster ──────────────
// The Live board is only linked from the home page when logged in, so a visitor
// here usually has a reg-app session. We read it straight from localStorage (no
// supabase-js bundle — same trick as judge.js), fetch their managed_player roster
// (RLS scopes it to their own account), and offer to follow every roster player
// whose name appears in the live pairings. Matching is by normalized full name
// only (there's no id link between roster and MacMahon's free-text names), so we
// never auto-subscribe silently — we surface a one-tap "ติดตามทั้งหมด" prompt.
const SB_URL = (typeof window !== 'undefined' && window.__SUPABASE_URL) || '';
const SB_KEY = (typeof window !== 'undefined' && window.__SUPABASE_KEY) || '';
let _rosterNames = null;      // Set of normalized "first last" from managed_player
let _rosterDismissed = false; // user closed the prompt this session

function _normName(s) { return (s || '').trim().replace(/\s+/g, ' ').toLowerCase(); }

async function loadRoster() {
  if (!SB_URL || !SB_KEY) return;
  let ref = '';
  try { ref = new URL(SB_URL).hostname.split('.')[0]; } catch { return; }
  if (!ref) return;
  let session = null;
  try {
    const raw = localStorage.getItem(`sb-${ref}-auth-token`);
    if (raw) session = JSON.parse(raw);
  } catch { return; }
  if (session && session.currentSession) session = session.currentSession;
  const token = session && session.access_token;
  const uid = session && session.user && session.user.id;
  if (!token || !uid) return; // not signed in
  if (session.expires_at && Date.now() / 1000 > session.expires_at) return; // expired
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/managed_player?owner_id=eq.${encodeURIComponent(uid)}&archived_at=is.null&select=first_name_th,last_name_th`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${token}`, Accept: 'application/json' } },
    );
    if (!res.ok) return;
    const rows = await res.json();
    if (!Array.isArray(rows)) return;
    _rosterNames = new Set(rows.map(r => _normName(`${r.first_name_th || ''} ${r.last_name_th || ''}`)).filter(Boolean));
    updateRosterBanner();
  } catch {}
}

// Roster players (exact live_match names) currently present in the pairings.
function _matchedRosterPlayers() {
  if (!_rosterNames || _rosterNames.size === 0) return [];
  const out = [];
  const seen = new Set();
  for (const div of divMeta) {
    const names = (divData[div.id] && divData[div.id].allNames) || [];
    for (const nm of names) {
      if (!_rosterNames.has(_normName(nm))) continue;
      const key = div.id + '|' + nm;
      if (!seen.has(key)) { seen.add(key); out.push({ divId: div.id, playerName: nm }); }
    }
  }
  return out;
}

function updateRosterBanner() {
  const el = document.getElementById('rosterBanner');
  if (!el) return;
  const notSubbed = _matchedRosterPlayers().filter(m => !isSubscribed(m.divId, m.playerName));
  if (_rosterDismissed || notSubbed.length === 0) { el.classList.add('hidden'); el.innerHTML = ''; return; }
  el.classList.remove('hidden');
  el.innerHTML = `<span class="rb-text">🎓 พบลูกศิษย์ของคุณ <b>${notSubbed.length}</b> คนในรายการแข่ง</span>
    <button class="rb-btn" onclick="followAllRoster()">ติดตามทั้งหมด</button>
    <button class="rb-x" onclick="dismissRosterBanner()" title="ปิด">✕</button>`;
}

function followAllRoster() {
  let added = 0;
  for (const m of _matchedRosterPlayers()) {
    if (!isSubscribed(m.divId, m.playerName)) { subscriptions.push({ divId: m.divId, playerName: m.playerName }); added++; }
  }
  if (added) {
    localStorage.setItem('tesuji_subs', JSON.stringify(subscriptions));
    renderMyCard();
    showToast(`🔔 ติดตามลูกศิษย์ ${added} คนแล้ว`, 'success', 3000);
  }
  updateRosterBanner();
}

function dismissRosterBanner() {
  _rosterDismissed = true;
  updateRosterBanner();
}

loadRoster();

let _lastAnnKey = null; // null = nothing rendered yet this session
function setAnnouncement(text, urgent, at) {
  const el = document.getElementById('announcementBanner');
  if (!el) return;
  if (!text) {
    el.classList.add('hidden');
    _lastAnnKey = '';
    return;
  }
  const key = text + '|' + (urgent ? '1' : '0') + '|' + (at || '');
  if (key !== _lastAnnKey) {
    // Build with textContent (never innerHTML) — the message is admin free text.
    el.textContent = '';
    const t = document.createElement('div');
    t.className = 'ann-text';
    t.textContent = text;
    el.appendChild(t);
    if (at) {
      const d = new Date(at);
      if (!isNaN(d)) {
        const tm = document.createElement('div');
        tm.className = 'ann-time';
        tm.textContent = 'ประกาศเมื่อ ' + d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';
        el.appendChild(tm);
      }
    }
    el.classList.toggle('urgent', !!urgent);
    // Pulse only when the message CHANGES mid-session (first paint already
    // has the fadeInDown entry animation).
    if (_lastAnnKey !== null) {
      el.classList.remove('ann-flash');
      void el.offsetWidth; // restart the animation
      el.classList.add('ann-flash');
    }
    _lastAnnKey = key;
  }
  el.classList.remove('hidden');
}

function renderLinks() {
  const container = document.getElementById('linksContainer');
  if (divMeta.length === 0) {
    container.innerHTML = '<div style="text-align:center;color:var(--text-dim);padding:40px 0">ยังไม่มีข้อมูลการแข่งขัน</div>';
    return;
  }
  container.innerHTML = divMeta.map((d, i) => {
    const delay = i * 0.06;
    return `
      <div class="div-btn" style="animation-delay: ${delay}s" onclick="openModal('${esc(d.id)}')">
        <div class="btn-label">
          <div class="btn-icon btn-icon-id">${esc(d.id)}</div>
          <span>${esc(d.name)}</span>
        </div>
        <span class="arrow">›</span>
      </div>
    `;
  }).join('');
}

function openModal(divId) {
  currentOpenDiv = divId;
  const meta = divMeta.find(d => d.id === divId);
  if (!meta) return;

  document.getElementById('modalTitle').textContent = meta.name;
  modalView = 'pairings'; // always open on the pairings tab
  renderModal(divId);

  document.getElementById('modalOverlay').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function _hasStandings(divId) {
  const s = standingsData[divId];
  return !!(s && s.rows && s.rows.length > 0);
}

// Both views live in one modal now: a "ผลจับคู่ / ตารางคะแนน" toggle appears when
// a wall list exists (it's overwritten each round by MacMahon's Export Wall List,
// so it always reflects the latest round). Re-run on every poll to refresh the
// open modal in place without resetting which tab the viewer is on.
function renderModal(divId) {
  const data = divData[divId] || {};
  const hasStandings = _hasStandings(divId);
  if (modalView === 'standings' && !hasStandings) modalView = 'pairings';

  // The pairings table has a fixed 4-column shape (board/name/result/name), so
  // it gets fixed column widths + name truncation (see .pairings-view in
  // results.css) — the standings table's columns vary with whatever MacMahon
  // exported, so it must keep the default auto layout.
  document
    .getElementById('modalTableWrap')
    ?.classList.toggle('pairings-view', modalView !== 'standings');

  const toggle = document.getElementById('modalViewToggle');
  if (hasStandings) {
    toggle.classList.add('visible');
    toggle.innerHTML =
      `<button class="mv-tab ${modalView === 'pairings' ? 'active' : ''}" onclick="setModalView('pairings')">ผลจับคู่</button>` +
      `<button class="mv-tab ${modalView === 'standings' ? 'active' : ''}" onclick="setModalView('standings')">ตารางคะแนน</button>`;
  } else {
    toggle.classList.remove('visible');
    toggle.innerHTML = '';
  }

  const rsEl = document.getElementById('roundSelector');
  if (modalView === 'standings') {
    rsEl.classList.remove('visible');
    renderStandings(standingsData[divId]);
    return;
  }

  const rounds = data.rounds || [];
  if (rounds.length > 0) {
    rsEl.classList.add('visible');
    if (!selectedRound || !rounds.includes(selectedRound)) {
      selectedRound = data.currentRound || rounds[rounds.length - 1];
    }
    const sortedRounds = [...rounds].sort((a, b) => parseFloat(a) - parseFloat(b));
    rsEl.innerHTML = sortedRounds.map(r =>
      `<div class="round-chip ${r === selectedRound ? 'active' : ''}" onclick="selectRound('${esc(r)}')">${esc(r)}</div>`
    ).join('');
  } else {
    rsEl.classList.remove('visible');
  }
  renderMatches(divId);
}

function setModalView(view) {
  modalView = view;
  if (currentOpenDiv) renderModal(currentOpenDiv);
}

function selectRound(r) {
  selectedRound = r;
  if (currentOpenDiv) {
    const data = divData[currentOpenDiv] || {};
    const rounds = data.rounds || [];
    const sortedRounds = [...rounds].sort((a, b) => parseFloat(a) - parseFloat(b));
    document.getElementById('roundSelector').innerHTML = sortedRounds.map(rd =>
      `<div class="round-chip ${rd === selectedRound ? 'active' : ''}" onclick="selectRound('${esc(rd)}')">${esc(rd)}</div>`
    ).join('');
    renderMatches(currentOpenDiv);
  }
}

function renderStandings(standings) {
  const thead = document.getElementById('modalThead');
  const tbody = document.getElementById('modalBody');
  const headers = standings.headers;

  thead.innerHTML = `<tr>${headers.map(h => `<th class="td-center">${esc(h)}</th>`).join('')}</tr>`;
  tbody.innerHTML = standings.rows.map(row => `
    <tr>
      ${row.map((cell, i) => {
        if (i === 1) return `<td style="font-weight:700;white-space:nowrap">${esc(cell)}</td>`;
        if (headers[i] && headers[i].toLowerCase() === 'score') return `<td class="td-center"><span class="badge done">${esc(cell)}</span></td>`;
        if (i === 0) {
          let badge = esc(cell);
          if (badge === '1') badge = '<span class="medal">🥇</span>';
          else if (badge === '2') badge = '<span class="medal">🥈</span>';
          else if (badge === '3') badge = '<span class="medal">🥉</span>';
          else badge = `<span class="place-num">${badge}</span>`;
          return `<td class="td-center">${badge}</td>`;
        }
        return `<td class="td-center" style="color:var(--text-muted);font-size:12px;white-space:nowrap">${esc(cell)}</td>`;
      }).join('')}
    </tr>
  `).join('');
}

// Player's current MacMahon score (จำนวนกระดานที่ชนะมา) from the uploaded
// standings — never computed locally, only read from what MacMahon exported
// (see renderStandings(): headers[1] = name, header 'score' = MM score).
function _mmScore(divId, playerName) {
  const standings = standingsData[divId];
  if (!standings || !standings.rows || !playerName) return null;
  const scoreIdx = standings.headers?.findIndex(h => h.toLowerCase() === 'score');
  if (scoreIdx == null || scoreIdx < 0) return null;
  const row = standings.rows.find(r => r[1]?.toString().trim() === playerName.trim());
  return row ? (row[scoreIdx] ?? null) : null;
}

// MacMahon's "Export Pairings" writes this literal name for an empty bye
// seat (odd number of entrants). Render it visibly distinct from a real
// player instead of a score-badged name, so it doesn't read as a participant.
const BYE_NAME = 'ไม่มีผู้เข้าแข่งขัน';

// Renders a player's name for the pairings table: given name on the first line,
// surname on the second. The winner is shown by colouring BOTH lines green (see
// .winner in results.css) — no trophy — and the MacMahon score now rides beside
// the result badge (see _scoreTag / renderMatches), not the name.
function _nameCell(playerName) {
  if (playerName === BYE_NAME) {
    return `<span class="pn-bye">${esc(playerName)}</span>`;
  }
  const name = (playerName || '-').trim();
  const sp = name.indexOf(' ');
  if (sp === -1) {
    return `<span class="pn-first">${esc(name)}</span>`;
  }
  const first = name.slice(0, sp);
  const last = name.slice(sp + 1);
  return (
    `<span class="pn-first">${esc(first)}</span>` +
    `<span class="pn-last">${esc(last)}</span>`
  );
}

// The MacMahon score (จำนวนกระดานที่ชนะ) carried with this specific match
// (m.blackScore / m.whiteScore from "Export Pairings"), falling back to the
// wall-list lookup when the pairing itself didn't carry one (older .jar). Shown
// next to the result badge so both players' scores read on one line.
function _scoreTag(divId, playerName, matchScore) {
  if (playerName === BYE_NAME) return '';
  const score = matchScore != null ? matchScore : _mmScore(divId, playerName);
  return score != null ? `<span class="pn-score">(${esc(String(score))})</span>` : '';
}

function renderMatches(divId) {
  const data = divData[divId] || {};
  const thead = document.getElementById('modalThead');
  const tbody = document.getElementById('modalBody');

  thead.innerHTML = `<tr>
    <th class="td-center">โต๊ะ</th>
    <th>ชื่อ</th>
    <th class="td-center">ผล</th>
    <th class="td-right">ชื่อ</th>
  </tr>`;

  const matches = (data.allMatches || []).filter(m => m.round === selectedRound);

  if (matches.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="td-center" style="color:var(--text-dim);padding:40px">ไม่มีการแข่งขันในรอบนี้</td></tr>`;
  } else {
    tbody.innerHTML = matches.map(m => {
      const isDone = m.result !== RESULT_PENDING;
      const bWin = isDone && m.result === RESULT_BLACK_WIN;
      const wWin = isDone && m.result === RESULT_WHITE_WIN;
      const bAbs = !!m.absentB;
      const wAbs = !!m.absentW;
      // ไม่มา (no-show) rides with the score in the result column — stacked under
      // the (score) tag so the row keeps its 2-line height (see .side-tag).
      const bSide = `<span class="side-tag">${_scoreTag(divId, m.black, m.blackScore)}${bAbs ? '<span class="absent-badge">ไม่มา</span>' : ''}</span>`;
      const wSide = `<span class="side-tag">${_scoreTag(divId, m.white, m.whiteScore)}${wAbs ? '<span class="absent-badge">ไม่มา</span>' : ''}</span>`;
      return `
        <tr>
          <td class="td-center" style="color:var(--text3);font-weight:700">${esc(m.table)}</td>
          <td class="${bWin ? 'winner' : ''}${bAbs ? ' absent-side' : ''}" title="${esc(m.black)}">${_nameCell(m.black)}</td>
          <td class="td-center"><span class="res-cell">${bSide}<span class="badge ${isDone ? 'done' : 'pending'}">${esc(m.result)}</span>${wSide}</span></td>
          <td class="td-right ${wWin ? 'winner' : ''}${wAbs ? ' absent-side' : ''}" title="${esc(m.white)}">${_nameCell(m.white)}</td>
        </tr>
      `;
    }).join('');
  }
}

function closeModal(e) {
  if (e && e.target !== document.getElementById('modalOverlay') && !e.target.classList.contains('modal-close')) return;
  currentOpenDiv = null;
  selectedRound = null;
  document.getElementById('modalOverlay').classList.remove('active');
  document.body.style.overflow = '';
}

// ── My Status Cards (compact list) ──
// Shared: a followed player's rank/score from the wall list (null if there's no
// wall list or the name doesn't match). MacMahon wraps a shared/tied place in
// parentheses, e.g. "(8)" = tied 8th.
function _standingInfo(divId, playerName) {
  const s = standingsData[divId];
  if (!s || !s.rows || !s.rows.length) return null;
  const row = s.rows.find(r => r[1]?.toString().trim() === playerName.trim());
  if (!row) return null;
  const raw = (row[0] ?? '').toString().trim();
  const tied = /^\(.*\)$/.test(raw);
  const num = raw.replace(/[()]/g, '');
  const scoreIdx = s.headers.findIndex(h => h.toLowerCase() === 'score');
  const scoreVal = scoreIdx >= 0 ? (row[scoreIdx] ?? '') : '';
  let placeDisp = '';
  if (num) {
    if (!tied && num === '1') placeDisp = '🥇';
    else if (!tied && num === '2') placeDisp = '🥈';
    else if (!tied && num === '3') placeDisp = '🥉';
    else placeDisp = `#${esc(num)}${tied ? ' (ร่วม)' : ''}`;
  }
  return { placeDisp, scoreVal: scoreVal === '' ? '-' : String(scoreVal) };
}

// The expandable detail for one followed player (everything under the summary
// row): optional wall-list standing strip + live tracking (latest result / next
// opponent) + round timer + actions. Name/status live on the row itself.
function buildPlayerDetail(divId, playerName, cardIdx = 0) {
  const data = divData[divId] || {};

  let rankBar = '';
  const info = _standingInfo(divId, playerName);
  if (info) {
    rankBar = `<div class="mc-rankbar">
      <div class="mc-rk"><div class="mc-rk-v">${info.placeDisp || '-'}</div><div class="mc-rk-l">อันดับ</div></div>
      <div class="mc-rk-sep"></div>
      <div class="mc-rk"><div class="mc-rk-v">${esc(info.scoreVal)}</div><div class="mc-rk-l">แต้ม</div></div>
    </div>`;
  }

  const allMatches = (data.allMatches || []).filter(m => m.black === playerName || m.white === playerName);
  const done = allMatches.filter(m => m.result !== RESULT_PENDING).sort((a,b) => parseFloat(b.round)-parseFloat(a.round));
  const pending = allMatches.filter(m => m.result === RESULT_PENDING).sort((a,b) => parseFloat(a.round)-parseFloat(b.round));
  const latestDone = done[0] || null;
  const nextMatch = pending[0] || null;

  let lastCell;
  if (latestDone) {
    const iB = latestDone.black === playerName;
    const won = (iB && latestDone.result === RESULT_BLACK_WIN) || (!iB && latestDone.result === RESULT_WHITE_WIN);
    lastCell = `<div class="mc-cell">
      <div class="mc-cell-l">ผลล่าสุด · รอบ ${esc(latestDone.round)}</div>
      <div class="mc-cell-v ${won?'v-win':'v-loss'}">${won?'🏆 ชนะ':'💔 แพ้'}</div>
      <div class="mc-cell-s">vs ${esc(iB?latestDone.white:latestDone.black)} · โต๊ะ ${esc(latestDone.table)}</div>
    </div>`;
  } else {
    lastCell = `<div class="mc-cell">
      <div class="mc-cell-l">ผลล่าสุด</div>
      <div class="mc-cell-v v-wait">รอผล…</div>
      <div class="mc-cell-s">&nbsp;</div>
    </div>`;
  }

  let nextCell;
  if (nextMatch) {
    const iB = nextMatch.black === playerName;
    const opp = iB ? nextMatch.white : nextMatch.black;
    nextCell = `<div class="mc-cell">
      <div class="mc-cell-l">คู่ต่อไป · รอบ ${esc(nextMatch.round)}</div>
      <div class="mc-cell-v mc-table">โต๊ะ ${esc(nextMatch.table)}</div>
      <div class="mc-cell-s">${esc(opp) || 'รอจับคู่'}</div>
    </div>`;
  } else {
    nextCell = `<div class="mc-cell">
      <div class="mc-cell-l">คู่ต่อไป</div>
      <div class="mc-cell-v v-muted">${latestDone?'รอประกาศ':'—'}</div>
      <div class="mc-cell-s">&nbsp;</div>
    </div>`;
  }

  return `${rankBar}
    <div id="ct-${cardIdx}" class="card-timer-inline"></div>
    <div class="mc-grid">${lastCell}${nextCell}</div>
    <div class="mc-actions">
      <button class="mc-btn mc-btn-hist" onclick="event.stopPropagation();openHistModal('${esc(divId)}','${esc(playerName)}')">📊 ดูผลงานทุกรอบ</button>
      <button class="mc-btn mc-btn-unsub" onclick="event.stopPropagation();unsubPlayer('${esc(divId)}','${esc(playerName)}')">🔕 เลิกติดตาม</button>
    </div>`;
}

// ── History Modal ──
function openHistModal(divId, playerName) {
  const data = divData[divId] || {};
  const allMatches = (data.allMatches || [])
    .filter(m => m.black === playerName || m.white === playerName)
    .sort((a, b) => parseFloat(a.round) - parseFloat(b.round));

  document.getElementById('histTitle').textContent = `📊 ${playerName}`;

  const body = document.getElementById('histBody');
  if (allMatches.length === 0) {
    body.innerHTML = `<div style="text-align:center;color:var(--text-dim);padding:40px">ยังไม่มีข้อมูล</div>`;
  } else {
    body.innerHTML = allMatches.map(m => {
      const iB = m.black === playerName;
      const opp = iB ? m.white : m.black;
      const isDone = m.result !== RESULT_PENDING;
      const won = isDone && ((iB && m.result === RESULT_BLACK_WIN) || (!iB && m.result === RESULT_WHITE_WIN));
      const badgeCls = !isDone ? 'pending' : won ? 'win' : 'loss';
      const badgeTxt = !isDone ? '⏳ ยังไม่แข่ง' : won ? '✅ ชนะ' : '❌ แพ้';
      return `<div class="hist-row">
        <div class="hist-round">R${esc(m.round)}</div>
        <div class="hist-info">
          <div class="hist-opp">vs ${esc(opp) || 'ไม่มีคู่'}</div>
          <div class="hist-meta">โต๊ะ ${esc(m.table)}</div>
        </div>
        <div class="hist-badge ${badgeCls}">${badgeTxt}</div>
      </div>`;
    }).join('');
  }

  document.getElementById('histOverlay').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeHistModal(e) {
  if (e && e.target !== document.getElementById('histOverlay')) return;
  document.getElementById('histOverlay').classList.remove('active');
  document.body.style.overflow = '';
}

// Live status of a followed player → drives sort (playing first) + the row pill.
function _subStatus(divId, playerName) {
  const data = divData[divId] || {};
  const cur = data.currentRound != null ? data.currentRound.toString() : null;
  const all = (data.allMatches || []).filter(m => m.black === playerName || m.white === playerName);
  const curMatch = cur ? all.find(m => m.round === cur) : null;
  if (curMatch && curMatch.result === RESULT_PENDING) {
    // Marked ไม่มา (no-show) by the judge and no result yet → show "ไม่มา",
    // not "กำลังแข่ง". Once a result lands, the won/lost branch takes over.
    const iB = curMatch.black === playerName;
    if (iB ? curMatch.absentB : curMatch.absentW) {
      return { kind: 'absent', prio: 1, round: curMatch.round };
    }
    return { kind: 'playing', prio: 0, table: curMatch.table };
  }
  if (curMatch) {
    const iB = curMatch.black === playerName;
    const won = (iB && curMatch.result === RESULT_BLACK_WIN) || (!iB && curMatch.result === RESULT_WHITE_WIN);
    return { kind: won ? 'won' : 'lost', prio: 1, round: curMatch.round };
  }
  if (all.length > 0) return { kind: 'waiting', prio: 2 };
  return { kind: 'none', prio: 3 };
}

function _statusPill(st) {
  if (st.kind === 'playing') return `<span class="mc-pill p-live">กำลังแข่ง · โต๊ะ ${esc(st.table)}</span>`;
  if (st.kind === 'won') return `<span class="mc-pill p-win">🏆 ชนะ · รอบ ${esc(st.round)}</span>`;
  if (st.kind === 'lost') return `<span class="mc-pill p-loss">แพ้ · รอบ ${esc(st.round)}</span>`;
  if (st.kind === 'absent') return `<span class="mc-pill p-absent">ไม่มา · รอบ ${esc(st.round)}</span>`;
  if (st.kind === 'waiting') return `<span class="mc-pill p-wait">รอจับคู่</span>`;
  return `<span class="mc-pill p-none">รอเริ่ม</span>`;
}

function setMyFilter(f) { myFilter = f; renderMyCard(); }
function onMySearch(v) { mySearch = v; renderMyCard(); }
function toggleSub(key) { expandedSubs[key] = !expandedSubs[key]; renderMyCard(); }

function renderMyCard() {
  const card = document.getElementById('myCard');
  const badge = document.getElementById('fabBadge');
  if (subscriptions.length === 0) {
    card.style.display = 'none';
    badge.style.display = 'none';
    return;
  }
  card.style.display = 'block';
  badge.style.display = 'flex';
  badge.textContent = subscriptions.length;

  const items = subscriptions.map((s, i) => ({
    divId: s.divId, playerName: s.playerName, idx: i, st: _subStatus(s.divId, s.playerName),
  }));
  items.sort((a, b) => a.st.prio - b.st.prio); // กำลังแข่งขึ้นก่อน

  const nPlaying = items.filter(x => x.st.kind === 'playing').length;
  const nDone = items.filter(x => ['won', 'lost', 'absent'].includes(x.st.kind)).length;
  const nWait = items.length - nPlaying - nDone;
  const single = items.length === 1; // one follower → keep the old always-open card

  // Name search only pays off with a longer list — show it from 5 followers up
  // (โค้ชที่ติดตามลูกศิษย์หลายคน). Below that the box disappears, so also drop
  // any leftover query or the list would stay filtered with no way to clear it.
  const showSearch = items.length >= 5;
  if (!showSearch) mySearch = '';
  const q = _normName(mySearch);

  const visible = items.filter(x => {
    if (myFilter === 'playing' && x.st.kind !== 'playing') return false;
    if (myFilter === 'done' && !['won', 'lost', 'absent'].includes(x.st.kind)) return false;
    if (q) {
      const meta = divMeta.find(d => d.id === x.divId);
      const hay = _normName(x.playerName + ' ' + (meta ? meta.name : x.divId));
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const summary = `<div class="mc-summary">
    <div class="mc-sum-title">🔔 ลูกศิษย์ที่ติดตาม</div>
    <div class="mc-sum-sub">${items.length} คน${nPlaying?` · <b style="color:var(--accent)">${nPlaying} กำลังแข่ง</b>`:''}${nDone?` · <b style="color:var(--green)">${nDone} จบรอบ</b>`:''}${nWait?` · ${nWait} รอ`:''}</div>
  </div>`;

  const chips = single ? '' : `<div class="mc-chips">
    <span class="mc-chip ${myFilter==='all'?'on':''}" onclick="setMyFilter('all')">ทั้งหมด ${items.length}</span>
    <span class="mc-chip ${myFilter==='playing'?'on':''}" onclick="setMyFilter('playing')">กำลังแข่ง ${nPlaying}</span>
    <span class="mc-chip ${myFilter==='done'?'on':''}" onclick="setMyFilter('done')">จบรอบ ${nDone}</span>
  </div>`;

  const search = showSearch
    ? `<input class="mc-search" id="mcSearch" type="search" placeholder="🔍 ค้นหาชื่อลูกศิษย์…" value="${esc(mySearch)}" oninput="onMySearch(this.value)" autocomplete="off">`
    : '';

  const rows = visible.map(x => {
    const key = x.divId + '|' + x.playerName;
    const expanded = single || !!expandedSubs[key];
    const meta = divMeta.find(d => d.id === x.divId);
    const divName = meta ? meta.name : x.divId;
    const info = _standingInfo(x.divId, x.playerName);
    const rank = info && info.placeDisp ? info.placeDisp : '';
    return `<div class="mc-item${expanded?' exp':''}">
      <div class="mc-row" onclick="toggleSub('${esc(key)}')">
        <div class="mc-main">
          <div class="mc-name">👤 ${esc(x.playerName)}</div>
          <div class="mc-meta">${esc(divName)}${rank?` · อันดับ ${rank}`:''}</div>
        </div>
        ${_statusPill(x.st)}
        <span class="mc-chev">${expanded?'▴':'▾'}</span>
      </div>
      ${expanded ? `<div class="mc-detail">${buildPlayerDetail(x.divId, x.playerName, x.idx)}</div>` : ''}
    </div>`;
  }).join('');

  const empty = visible.length === 0
    ? `<div class="mc-empty">${q ? `ไม่พบชื่อ "${esc(mySearch.trim())}"` : 'ไม่มีคนในหมวดนี้'}</div>`
    : '';

  // The card is rebuilt wholesale on every data poll — if the coach is mid-typing
  // in the search box, carry focus + caret across the innerHTML swap.
  const prevSearch = document.getElementById('mcSearch');
  const hadFocus = !!prevSearch && document.activeElement === prevSearch;
  const caret = hadFocus ? prevSearch.selectionStart : null;

  card.innerHTML = `<div class="my-cards-wrap">${summary}${chips}${search}${rows}${empty}</div>`;

  if (hadFocus) {
    const el = document.getElementById('mcSearch');
    if (el) {
      el.focus();
      try { el.setSelectionRange(caret, caret); } catch {}
    }
  }

  // Round timer only on the actual competition day — its pre-day state is just a
  // "วันแข่งขัน: <date>" line, which clutters the card, so we skip it until then.
  visible.forEach(x => {
    const open = single || expandedSubs[x.divId + '|' + x.playerName];
    if (open && _isTournamentDay()) renderRoundTimer(`ct-${x.idx}`, x.divId);
  });
}

function unsubPlayer(divId, playerName) {
  subscriptions = subscriptions.filter(s => !(s.divId===divId && s.playerName===playerName));
  localStorage.setItem('tesuji_subs', JSON.stringify(subscriptions));
  renderMyCard();
  showToast(`🔕 ยกเลิกติดตาม ${playerName}`, 'info', 2000);
}

// ── Change Detection → Toast ──
function checkResultChanges(isFirst) {
  for (const { divId, playerName } of subscriptions) {
    const data = divData[divId] || {};
    const myMatches = (data.allMatches || []).filter(m => m.black===playerName || m.white===playerName);
    for (const m of myMatches) {
      const key = `${divId}|${m.round}|${m.table}`;
      const prev = prevResults[key];
      const cur = m.result;
      prevResults[key] = cur;
      if (isFirst || prev===cur || cur===RESULT_PENDING) continue;
      const iB = m.black===playerName;
      const won = (iB && cur===RESULT_BLACK_WIN) || (!iB && cur===RESULT_WHITE_WIN);
      const opp = iB ? m.white : m.black;
      showToast(
        won ? `🏆 ${playerName} ชนะรอบ ${m.round}!` : `💔 ${playerName} แพ้รอบ ${m.round}`,
        won?'win':'loss', 5000
      );
    }
  }
}

// ── Toast ──
function showToast(msg, type = 'info', duration = 3500) {
  const wrap = document.getElementById('toastWrap');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  wrap.appendChild(t);
  setTimeout(() => {
    t.classList.add('out');
    setTimeout(() => t.remove(), 300);
  }, duration);
}

// ── Subscribe Modal ──
function openSubModal() {
  subStep = 'div';
  subPickedDiv = null;
  const count = subscriptions.length;
  document.getElementById('subTitle').textContent = count > 0 ? `ติดตามอยู่ ${count} คน 🔔` : 'ติดตามผลของฉัน 🔔';
  document.getElementById('subStepLabel').textContent = 'เลือกสาย';
  document.getElementById('subSearch').style.display = 'none';
  document.getElementById('subSearch').value = '';
  document.getElementById('subBackBtn').style.display = 'none';
  renderSubList();
  document.getElementById('subOverlay').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeSubModal(e) {
  if (e && e.target !== document.getElementById('subOverlay')) return;
  document.getElementById('subOverlay').classList.remove('active');
  document.body.style.overflow = '';
}

function isSubscribed(divId, playerName) {
  return subscriptions.some(s => s.divId===divId && s.playerName===playerName);
}

function renderSubList() {
  const list = document.getElementById('subList');
  if (subStep === 'div') {
    list.innerHTML = divMeta.map(d => {
      const count = subscriptions.filter(s => s.divId===d.id).length;
      return `<div class="sub-item" onclick="subPickDiv('${esc(d.id)}')">
        <span class="si-icon">♟️</span>${esc(d.name)}
        ${count > 0 ? `<span style="margin-left:auto;font-size:11px;color:var(--green);font-weight:700">${count} คน</span>` : '<span class="si-check"></span>'}
      </div>`;
    }).join('');
  } else {
    filterSubList();
  }
}

function filterSubList() {
  const list = document.getElementById('subList');
  const q = document.getElementById('subSearch').value.toLowerCase();
  const data = divData[subPickedDiv] || {};
  const allNames = data.allNames || [];
  const filtered = q ? allNames.filter(n => n.toLowerCase().includes(q)) : allNames;
  if (filtered.length === 0) {
    list.innerHTML = `<div style="text-align:center;color:var(--text-dim);padding:30px">ไม่พบชื่อ</div>`;
    return;
  }
  list.innerHTML = filtered.map(n => {
    const subbed = isSubscribed(subPickedDiv, n);
    return `<div class="sub-item ${subbed?'subscribed':''}" onclick="subPickPlayer('${esc(n)}')">
      <span class="si-icon">👤</span>${esc(n)}
      <span class="si-check"></span>
    </div>`;
  }).join('');
}

function subPickDiv(divId) {
  subPickedDiv = divId;
  subStep = 'player';
  const meta = divMeta.find(d => d.id === divId);
  document.getElementById('subTitle').textContent = meta ? meta.name : divId;
  document.getElementById('subStepLabel').textContent = 'แตะชื่อเพื่อติดตาม / ยกเลิก';
  document.getElementById('subSearch').style.display = 'block';
  document.getElementById('subSearch').value = '';
  document.getElementById('subSearch').focus();
  document.getElementById('subBackBtn').style.display = 'flex';
  renderSubList();
}

function subGoBack() {
  subStep = 'div';
  subPickedDiv = null;
  const count = subscriptions.length;
  document.getElementById('subTitle').textContent = count > 0 ? `ติดตามอยู่ ${count} คน 🔔` : 'ติดตามผลของฉัน 🔔';
  document.getElementById('subStepLabel').textContent = 'เลือกสาย';
  document.getElementById('subSearch').style.display = 'none';
  document.getElementById('subBackBtn').style.display = 'none';
  renderSubList();
}

// ── Schedule Modal ──
function openScheduleModal() {
  renderSchedule('scheduleContainer');
  document.getElementById('scheduleOverlay').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeScheduleModal(e) {
  if (e && e.target !== document.getElementById('scheduleOverlay') && !e.target.classList.contains('modal-close')) return;
  document.getElementById('scheduleOverlay').classList.remove('active');
  document.body.style.overflow = '';
}

// ── Help Modal ──
function openHelpModal() {
  document.getElementById('helpOverlay').classList.add('active');
  document.body.style.overflow = 'hidden';
}
function closeHelpModal(e) {
  if (e && e.target !== document.getElementById('helpOverlay') && !e.target.classList.contains('help-close')) return;
  document.getElementById('helpOverlay').classList.remove('active');
  document.body.style.overflow = '';
  localStorage.setItem('tesuji-help-seen', '1');
}
// Auto-show on first visit
if (!localStorage.getItem('tesuji-help-seen')) {
  document.addEventListener('DOMContentLoaded', () => setTimeout(openHelpModal, 800));
}

function subPickPlayer(name) {
  const already = isSubscribed(subPickedDiv, name);
  if (already) {
    subscriptions = subscriptions.filter(s => !(s.divId===subPickedDiv && s.playerName===name));
    showToast(`🔕 ยกเลิกติดตาม ${name}`, 'info', 2000);
  } else {
    subscriptions.push({ divId: subPickedDiv, playerName: name });
    showToast(`🔔 ติดตาม ${name} แล้ว`, 'info', 2000);
  }
  localStorage.setItem('tesuji_subs', JSON.stringify(subscriptions));
  renderMyCard();
  filterSubList();
  document.getElementById('subTitle').textContent = `${divMeta.find(d=>d.id===subPickedDiv)?.name||subPickedDiv}`;
}

// ── Venue Map (แผนผังงาน) ─────────────────────────────────────────────────────
// Full-screen pinch-zoom / pan viewer for the floor-plan image the admin uploads
// on the tournament form (tournament.venue_map_url, carried in each snapshot).
// The "🗺️ แผนที่" badge only appears once a snapshot delivers a URL, and the
// image itself is only fetched on first open — spectators who never tap the
// button don't pay for the download.
let _mapUrl = '';
let _mapHintTimer = null;

function setVenueMap(url) {
  url = url || '';
  if (url === _mapUrl) return;
  _mapUrl = url;
  const show = url ? '' : 'none';
  document.getElementById('mapBadge').style.display = show;
  document.getElementById('helpMapSection').style.display = show;
  const img = document.getElementById('mapImg');
  if (!url) {
    img.removeAttribute('src');
    img.classList.remove('loaded');
    // Admin removed the map while someone had it open: aborting the load this
    // way fires neither onload nor onerror, so tidy up and close the viewer
    // rather than leaving a blank overlay / eternal spinner.
    document.getElementById('mapLoading').style.display = 'none';
    if (document.getElementById('mapOverlay').classList.contains('active')) {
      closeMapModal();
      showToast('แผนผังงานถูกนำออกแล้ว', 'info', 2500);
    }
  }
}

function openMapModal() {
  if (!_mapUrl) return;
  const img = document.getElementById('mapImg');
  if (img.getAttribute('src') !== _mapUrl) {
    img.classList.remove('loaded');
    document.getElementById('mapLoading').style.display = 'block';
    img.onload = () => {
      document.getElementById('mapLoading').style.display = 'none';
      img.classList.add('loaded');
      _mapResetView(false);
    };
    img.onerror = () => {
      document.getElementById('mapLoading').style.display = 'none';
      // Clear src so the next tap on the badge actually retries the download
      // (with it left in place, the reload guard above would skip forever).
      img.removeAttribute('src');
      showToast('โหลดแผนผังไม่สำเร็จ ลองใหม่อีกครั้ง', 'info', 3000);
    };
    img.src = _mapUrl;
  }
  _mapResetView(false);
  document.getElementById('mapOverlay').classList.add('active');
  document.body.style.overflow = 'hidden';
  // Nudge first-time users toward the gestures, then get out of the way.
  const hint = document.getElementById('mapHint');
  hint.classList.add('show');
  clearTimeout(_mapHintTimer);
  _mapHintTimer = setTimeout(() => hint.classList.remove('show'), 3500);
}

function closeMapModal() {
  document.getElementById('mapOverlay').classList.remove('active');
  document.body.style.overflow = '';
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.getElementById('mapOverlay').classList.contains('active')) closeMapModal();
});

// ── Map pan/zoom engine (Pointer Events; no library) ──
// Model: the img is laid out fit-to-stage by flexbox, then transformed with
// translate(tx,ty) scale(s) around its own center. All coords below are px
// offsets from the stage center, so clamping and zoom-anchor math stay simple.
const _mapView = { s: 1, tx: 0, ty: 0 };
const _mapPtrs = new Map();          // active pointers: id → {x, y}
let _mapGesture = null;              // snapshot at gesture start
let _mapMoved = false;               // did this gesture pan/pinch beyond a tap?
let _mapLastTap = { t: 0, x: 0, y: 0 };

function _mapEls() {
  return { stage: document.getElementById('mapStage'), img: document.getElementById('mapImg') };
}

function _mapApply(animate) {
  const { img } = _mapEls();
  img.classList.toggle('animating', !!animate);
  img.style.transform = `translate(${_mapView.tx}px, ${_mapView.ty}px) scale(${_mapView.s})`;
}

function _mapResetView(animate) {
  _mapView.s = 1; _mapView.tx = 0; _mapView.ty = 0;
  _mapApply(animate);
}

// Keep the image on-screen: an axis whose scaled size fits the stage stays
// centered; a larger axis may pan until its edge meets the stage edge.
function _mapClamp() {
  const { stage, img } = _mapEls();
  const mx = Math.max(0, (img.offsetWidth * _mapView.s - stage.clientWidth) / 2);
  const my = Math.max(0, (img.offsetHeight * _mapView.s - stage.clientHeight) / 2);
  _mapView.tx = Math.min(mx, Math.max(-mx, _mapView.tx));
  _mapView.ty = Math.min(my, Math.max(-my, _mapView.ty));
}

// Zoom to scale ns keeping the image point under stage-point (px,py) fixed.
function _mapZoomAt(px, py, ns, animate) {
  ns = Math.min(5, Math.max(1, ns));
  const k = ns / _mapView.s;
  _mapView.tx = px - (px - _mapView.tx) * k;
  _mapView.ty = py - (py - _mapView.ty) * k;
  _mapView.s = ns;
  _mapClamp();
  _mapApply(animate);
}

// Stage-center-relative coordinates of a pointer/mouse event.
function _mapPoint(e) {
  const r = _mapEls().stage.getBoundingClientRect();
  return { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 };
}

function _mapSnapshotGesture() {
  const pts = [..._mapPtrs.values()];
  _mapGesture = {
    s: _mapView.s, tx: _mapView.tx, ty: _mapView.ty,
    pts: pts.map(p => ({ x: p.x, y: p.y })),
  };
}

function _mapInit() {
  const { stage } = _mapEls();
  if (!stage) return;

  stage.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    stage.setPointerCapture(e.pointerId);
    _mapPtrs.set(e.pointerId, _mapPoint(e));
    _mapMoved = false;
    _mapSnapshotGesture();
    stage.classList.add('dragging');
  });

  stage.addEventListener('pointermove', (e) => {
    if (!_mapPtrs.has(e.pointerId)) return;
    _mapPtrs.set(e.pointerId, _mapPoint(e));
    if (!_mapGesture) return;
    const pts = [..._mapPtrs.values()];
    if (pts.length === 1) {
      const dx = pts[0].x - _mapGesture.pts[0].x;
      const dy = pts[0].y - _mapGesture.pts[0].y;
      if (Math.abs(dx) + Math.abs(dy) > 6) _mapMoved = true;
      _mapView.tx = _mapGesture.tx + dx;
      _mapView.ty = _mapGesture.ty + dy;
      _mapClamp();
      _mapApply(false);
    } else if (pts.length >= 2 && _mapGesture.pts.length >= 2) {
      _mapMoved = true;
      const [a0, b0] = _mapGesture.pts;
      const [a1, b1] = pts;
      const d0 = Math.hypot(b0.x - a0.x, b0.y - a0.y) || 1;
      const d1 = Math.hypot(b1.x - a1.x, b1.y - a1.y);
      const ns = Math.min(5, Math.max(1, _mapGesture.s * (d1 / d0)));
      const mid0 = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 };
      const mid1 = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 };
      // Keep the image point that started under the pinch midpoint pinned to
      // the midpoint as it moves and the fingers spread: q=(mid0-t0)/s0.
      _mapView.tx = mid1.x - ((mid0.x - _mapGesture.tx) / _mapGesture.s) * ns;
      _mapView.ty = mid1.y - ((mid0.y - _mapGesture.ty) / _mapGesture.s) * ns;
      _mapView.s = ns;
      _mapClamp();
      _mapApply(false);
    }
  });

  const end = (e) => {
    if (!_mapPtrs.has(e.pointerId)) return;
    const wasSingle = _mapPtrs.size === 1;
    _mapPtrs.delete(e.pointerId);
    if (_mapPtrs.size === 0) stage.classList.remove('dragging');
    // Re-anchor whatever fingers remain so the image doesn't jump.
    if (_mapPtrs.size > 0) _mapSnapshotGesture(); else _mapGesture = null;
    // Double-tap (or double-click) toggles between fit and 2.5x at the tap point.
    if (wasSingle && !_mapMoved && e.type === 'pointerup') {
      const p = _mapPoint(e);
      const now = Date.now();
      const isDouble = now - _mapLastTap.t < 320 &&
        Math.hypot(p.x - _mapLastTap.x, p.y - _mapLastTap.y) < 28;
      _mapLastTap = { t: isDouble ? 0 : now, x: p.x, y: p.y };
      if (isDouble) _mapZoomAt(p.x, p.y, _mapView.s > 1.2 ? 1 : 2.5, true);
    }
  };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);

  // Desktop: scroll/trackpad zoom around the cursor.
  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    const p = _mapPoint(e);
    const factor = Math.exp(-e.deltaY * 0.0022);
    _mapZoomAt(p.x, p.y, _mapView.s * factor, false);
  }, { passive: false });

  // Rotating the phone (or resizing the window) changes the fitted layout size
  // the clamp math is based on — re-clamp so a zoomed image can't get stranded
  // outside the new viewport.
  window.addEventListener('resize', () => {
    if (!document.getElementById('mapOverlay').classList.contains('active')) return;
    _mapClamp();
    _mapApply(false);
  });
}

_mapInit();
