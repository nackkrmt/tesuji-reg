/* ============================================================
   TESUJI — Judge Page Logic (index.html clone)
   Requires: common.js loaded first

   Adapted from v1's public/app.js for the Supabase backend (that tree is not
   in this repository; this file is the logic of record):
     1. Transport: v1's held-open SSE (/api/events) → poll /live/snapshot every 3s
        (same endpoint the Live page uses; Vercel-serverless friendly).
     2. Submitter identity: always the visitor's real Thai first name, read from
        the reg-app session (profile.first_name_th). There's no manual name entry
        anymore — access is blocked entirely if a name can't be resolved (not
        signed in, or signed in with no first_name_th on their profile).
     3. Writes carry the judge secret (x-admin-token = the [key] in the URL) so the
        token-gated REST endpoints (/api/divisions/:id/{result,checkin,force}) accept
        them. The rest of the file is v1 app.js unchanged.
     4. One console = one tournament (20260908_0001): the token belongs to a single
        tournament, the snapshot poll is scoped to it, and a result queued
        offline remembers which tournament it was for and is never replayed
        into another one.
   ============================================================ */

// Injected by app/judge/[key]/route.ts.
const JUDGE_SECRET = (typeof window !== 'undefined' && window.__JUDGE_SECRET) || '';
const LIVE_TID = (typeof window !== 'undefined' && window.__LIVE_TID) || '';
const SUPABASE_URL = (typeof window !== 'undefined' && window.__SUPABASE_URL) || '';
const SUPABASE_KEY = (typeof window !== 'undefined' && window.__SUPABASE_KEY) || '';

// A stable id for THIS phone, used only as the rate limiter's bucket key
// (lib/live/apiShared.ts). It is not a credential — the token still decides
// what may be written. Without it every judge at the venue shared one bucket
// (same tournament token, same NAT'd wifi), so the whole team's check-ins at
// round start counted against a single cap and started failing together.
const CLIENT_ID_KEY = 'tesuji_judge_client';
let _clientId = _lsGet(CLIENT_ID_KEY);
if (!_clientId) {
  _clientId = 'j' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  _lsSet(CLIENT_ID_KEY, _clientId);
}

// Auth headers for the guarded write endpoints.
function _writeHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-admin-token': JUDGE_SECRET,
    'x-judge-client': _clientId,
  };
}

let divisions = [], allDivData = {};
let currentDiv = null, currentRound = null;
let matchData = { matches: [], rounds: [], allNames: [] };
let isLocked = false, isHistoryMode = false;
let _roundPickedByUser = false;   // the round changed because a judge chose it
let currentForceTable = null;
let currentUser = null;
let judgeDefaultDivision = null;

// ─── Identity (always the reg-app session — no manual entry) ───
function getInitial(name) {
  if (!name) return '?';
  return name.trim().charAt(0).toUpperCase();
}

function showUserMenu() {
  if (!currentUser) return;
  document.getElementById('userMenuAvatar').textContent = getInitial(currentUser);
  document.getElementById('userMenuName').textContent = currentUser;
  openModal('userMenuModal');
}

// Shows the app if a name was resolved, otherwise blocks access entirely with
// the "ต้อง Login..." screen (see resolveAuthUser()) — never shows a form.
function applyLoginState() {
  const loginScreen = document.getElementById('loginScreen');
  const userBadge = document.getElementById('userBadge');
  if (currentUser) {
    loginScreen.classList.add('hidden');
    userBadge.classList.remove('hidden');
    document.getElementById('userAvatar').textContent = getInitial(currentUser);
    document.getElementById('userName').textContent = currentUser;
  } else {
    loginScreen.classList.remove('hidden');
    userBadge.classList.add('hidden');
  }
}

// ─── Auth name (reg-app session) ───────────────────────────────
// Read the Supabase session the reg app persisted in localStorage (same origin,
// default storageKey sb-<ref>-auth-token), then fetch the user's own profile row
// via PostgREST to get their Thai first name (last name intentionally dropped —
// just the first name is used to identify who submitted a result) and, if they
// hold the judge role, their default รุ่น. No supabase-js bundle needed. Any
// failure (not signed in / expired / no profile) leaves currentUser null, which
// blocks access entirely (see applyLoginState()).
function _supabaseRef() {
  try { return new URL(SUPABASE_URL).hostname.split('.')[0]; } catch { return ''; }
}

// Supabase access tokens last an hour, and NOTHING on this page used to renew
// one: only the React reg app runs supabase-js with autoRefreshToken, and the
// /results hub navigates here in the SAME tab, so there is no reg-app tab left
// running to do it. An hour in — a reload to clear a glitch, the webview killed
// while the phone was locked, or just opening the console again after lunch —
// resolveAuthUser() saw an expired token, gave up, and showed the full-screen
// "ต้อง Login" block to a judge who was signed in the whole time. Worse, init
// returned before scheduling anything, so any results waiting in the queue
// stopped flushing too. Redeem the refresh token instead, and write the new
// session back under the same key in supabase-js's own shape so the reg app
// picks it up as well.
let _authSession = null;
let _authRef = '';

async function _refreshSession() {
  const session = _authSession;
  if (!session || !session.refresh_token) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });
    if (!res.ok) return null;
    const next = await res.json();
    if (!next || !next.access_token) return null;
    // The endpoint returns expires_in; supabase-js persists an absolute
    // expires_at (seconds) and reads it back on the next load.
    if (!next.expires_at) {
      next.expires_at = Math.floor(Date.now() / 1000) + (next.expires_in || 3600);
    }
    _authSession = next;
    _lsSet(`sb-${_authRef}-auth-token`, JSON.stringify(next));
    return next;
  } catch { return null; }
}

// GET against PostgREST with the session token, renewing it once on a 401 —
// the token can expire between the check below and a later call.
async function _authedGet(path) {
  if (!_authSession) return null;
  const send = () => fetch(`${SUPABASE_URL}${path}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${_authSession.access_token}`,
      Accept: 'application/json',
    },
  });
  try {
    let res = await send();
    if (res.status === 401 && await _refreshSession()) res = await send();
    if (!res.ok) return null;
    const rows = await res.json();
    return Array.isArray(rows) ? (rows[0] ?? null) : null;
  } catch { return null; }
}

async function resolveAuthUser() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  _authRef = _supabaseRef();
  if (!_authRef) return;
  let session = _lsJSON(`sb-${_authRef}-auth-token`, null);
  if (session && session.currentSession) session = session.currentSession; // older wrap shape
  if (!session || !session.access_token) return;
  _authSession = session;
  const uid = session.user && session.user.id;
  if (!uid) return;
  // 60s of slack: a token that expires while the profile fetch is in flight
  // would come back 401 and cost a round-trip to discover.
  if (session.expires_at && Date.now() / 1000 > session.expires_at - 60) {
    if (!await _refreshSession()) return; // refresh token gone too — really signed out
  }

  const p = await _authedGet(
    `/rest/v1/profile?id=eq.${encodeURIComponent(uid)}&select=first_name_th`,
  );
  if (p && p.first_name_th) currentUser = p.first_name_th.trim();

  if (!LIVE_TID) return;
  // Default รุ่น is per (tournament, judge) — tournament_judge, own rows only (RLS).
  const r = await _authedGet(
    `/rest/v1/tournament_judge?tournament_id=eq.${encodeURIComponent(LIVE_TID)}&account_id=eq.${encodeURIComponent(uid)}&select=default_division_id`,
  );
  if (r && r.default_division_id) judgeDefaultDivision = r.default_division_id;
}

// ─── Data transport (poll /live/snapshot; replaces v1 SSE) ─────
// v1 held a /api/events SSE stream open. That doesn't fit Vercel's serverless
// model, so — exactly like the Live page (public/live-assets/results.js) — we poll
// a one-shot snapshot every 3s. The payload IS a v1 FULL_UPDATE message, so it
// feeds straight into the unchanged handleMsg() below. ETag/304 keeps polls cheap.
const POLL_MS = 3000;
const POLL_MAX_MS = 30000;   // backoff ceiling while the endpoint keeps failing
let _snapshotEtag = null;
let _failStreak = 0;
let _pollTimer = null;

async function pollSnapshot() {
  if (!LIVE_TID) { setConn('disconnected'); return; }
  try {
    const res = await fetch('/live/snapshot?t=' + encodeURIComponent(LIVE_TID), {
      cache: 'no-store',
      headers: _snapshotEtag ? { 'If-None-Match': _snapshotEtag } : {},
    });
    if (res.status === 304) { _failStreak = 0; setConn('connected'); return; }
    if (!res.ok) { _failStreak++; setConn('disconnected'); return; }
    _failStreak = 0;
    _snapshotEtag = res.headers.get('ETag');
    handleMsg(await res.json());
  } catch { _failStreak++; setConn('disconnected'); }
}

// The board (results.js) got this treatment and the console did not: a fixed
// setInterval kept firing every 3s in a backgrounded tab — ~1,200 requests an
// hour per judge phone left open on the day the system is actually under load —
// and kept hammering at full rate through an outage instead of backing off.
// Same setTimeout chain here. The offline queue's flush is on its own timer, so
// results still drain while polling is paused.
function _pollDelay() {
  return _failStreak === 0
    ? POLL_MS
    : Math.min(POLL_MS * Math.pow(2, _failStreak), POLL_MAX_MS);
}

function _schedulePoll() {
  clearTimeout(_pollTimer);
  if (document.hidden) return;
  _pollTimer = setTimeout(_tick, _pollDelay());
}

async function _tick() {
  await pollSnapshot();
  _schedulePoll();
}

document.addEventListener('visibilitychange', () => {
  clearTimeout(_pollTimer); // never leave a second chain running alongside
  if (document.hidden) return;
  _failStreak = 0; // coming back deserves an immediate full-rate attempt
  _tick();
});

function handleMsg(data) {
  if (data.type === 'CONNECTED') { setConn('connected'); return; }
  if (data.type === 'ANNOUNCEMENT') {
    setAnnouncement(data.announcement);
    return;
  }
  if (data.type === 'FULL_UPDATE') {
    setConn('connected');
    divisions = data.divisions || [];
    allDivData = data.divData || {};
    setAnnouncement(data.announcement || '', !!data.announcementUrgent, data.announcementAt || '');
    const newMap = data.scheduleMap || {};
    const newDate = data.tournamentDate || '';
    if (JSON.stringify(newMap) !== JSON.stringify(window._scheduleMap) || newDate !== window._tournamentDate) {
      const el = document.getElementById('roundTimer');
      if (el) el._timerDivId = null;
    }
    window._scheduleMap = newMap;
    window._tournamentDate = newDate;
    window.SCHEDULE = data.schedule || [];
    renderDivPicker();
    if (currentDiv && allDivData[currentDiv]) {
      applyDivData(allDivData[currentDiv]);
    }
  }
}

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
    // Pulse only when the message CHANGES mid-session (not on first paint).
    if (_lastAnnKey !== null) {
      el.classList.remove('ann-flash');
      void el.offsetWidth; // restart the animation
      el.classList.add('ann-flash');
    }
    _lastAnnKey = key;
  }
  el.classList.remove('hidden');
}

function setConn(s) {
  const el = document.getElementById('conn');
  el.className = 'conn ' + s;
}

// ─── Division Picker ─────────────────────────────────────────
function renderDivPicker() {
  const sel = document.getElementById('divPicker');
  const prev = currentDiv || sel.value;
  if (divisions.length === 0) {
    sel.innerHTML = '<option value="">ยังไม่มีรุ่น</option>';
    return;
  }
  sel.innerHTML = divisions.map(d =>
    `<option value="${esc(d.id)}" ${d.id === prev ? 'selected' : ''}>${esc(d.name)}</option>`
  ).join('');
  if (!currentDiv) {
    const hasDefault = judgeDefaultDivision && divisions.some(d => d.id === judgeDefaultDivision);
    currentDiv = hasDefault ? judgeDefaultDivision : divisions[0].id;
    sel.value = currentDiv;
  }
  if (currentDiv && allDivData[currentDiv]) {
    applyDivData(allDivData[currentDiv]);
  } else {
    loadDivData();
  }
}

function onDivChange() {
  currentDiv = document.getElementById('divPicker').value;
  currentRound = null;
  _roundPickedByUser = true;  // a division switch is not "a new round arrived"
  pendingCheckins = {};   // table|side keys aren't unique across divisions
  pendingAbsents = {};
  pendingResults = {};
  attBusy = {};
  loadDivData();
  if (activeTab === 'schedule') renderSchedule('judgeSchedule', currentDiv);
}

async function loadDivData() {
  if (!currentDiv) return;
  try {
    const url = `/api/divisions/${currentDiv}/matches${currentRound ? '?round=' + currentRound : ''}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.success) {
      allDivData[currentDiv] = data;
      applyDivData(data);
    }
  } catch {}
}

function applyDivData(data) {
  const rounds = data.rounds || [];
  const rnd = currentRound || data.currentRound;
  currentRound = rnd;

  // The snapshot no longer ships a pre-filtered `matches` list (it was the
  // current round duplicated inside every payload, downloaded by every
  // spectator every 3s); /api/divisions/:id/matches still does, for the .jar.
  // Derive it when it is absent — and always apply the pending-result overlay.
  const rows = data.matches || (data.allMatches || []).filter(m => m.round == rnd);
  matchData = { ...data, matches: rows.map(_withPendingResult) };

  const sel = document.getElementById('roundPicker');
  sel.innerHTML = rounds.length === 0
    ? '<option value="">ยังไม่มีรอบ</option>'
    : rounds.map(r => `<option value="${esc(r)}" ${r == rnd ? 'selected' : ''}>รอบที่ ${esc(r)}</option>`).join('');

  const wasHistoryMode = isHistoryMode;
  isHistoryMode = rounds.length > 0 && rnd != rounds[0];
  const lbl = document.getElementById('roundLabel');
  lbl.textContent = isHistoryMode ? 'ย้อนหลัง' : 'รอบ';
  sel.className = isHistoryMode ? 'history' : '';
  // A judge mid-entry on round 3 when MacMahon exports round 4 is switched to a
  // locked view without being told: the buttons simply stop working and the
  // picker turns yellow. Say what happened, once, when it happens to them.
  if (isHistoryMode && !wasHistoryMode && !_roundPickedByUser) {
    showToast('ℹ️ รอบใหม่ถูกอัปโหลดแล้ว — รอบนี้ปิดการแก้ไข ถ้าต้องแก้ผลย้อนหลังให้แจ้งผู้จัดการแข่งขัน', 'info');
  }
  _roundPickedByUser = false;

  const total = matchData.matches?.length || 0;
  const sent = matchData.matches?.filter(m => m.result !== RESULT_PENDING).length || 0;
  isLocked = total > 0 && sent === total;
  document.getElementById('lockBanner').classList.toggle('hidden', !isLocked);

  renderResults();
  renderCheckin();
  renderStatus();
  renderRoundTimer('roundTimer', currentDiv);
}

function onRoundChange() {
  currentRound = document.getElementById('roundPicker').value;
  _roundPickedByUser = true;  // deliberate: no "a new round was uploaded" toast
  pendingCheckins = {};   // table|side keys aren't unique across rounds
  pendingAbsents = {};
  pendingResults = {};
  attBusy = {};
  const divData = allDivData[currentDiv];
  if (divData?.allMatches) {
    const matches = divData.allMatches.filter(m => m.round === currentRound);
    const allNames = [...new Set(matches.flatMap(m => [m.black, m.white]).filter(n => n && n !== 'BYE'))].sort();
    applyDivData({ ...divData, matches, allNames, currentRound });
  } else {
    loadDivData();
  }
}

// ─── Tabs ───────────────────────────────────────────────────
let activeTab = 'submit';
let selectedTable = null;

function switchTab(name, btn) {
  activeTab = name;
  document.querySelectorAll('.tab-content').forEach(el => {
    el.classList.toggle('active', el.id === 'tab-' + name);
    el.classList.toggle('hidden', el.id !== 'tab-' + name);
  });
  document.querySelectorAll('.nav-btn').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  if (name === 'submit') renderStatus();
  if (name === 'results') renderResults();
  if (name === 'schedule') renderSchedule('judgeSchedule', currentDiv);
  if (name === 'checkin') renderCheckin();
}

// ─── Tab: ส่งผล + สถานะ ──────────────────────────────────────
function selectTable(tbl) {
  const m = (matchData.matches || []).find(x => x.table.toString() === tbl.toString());
  if (!m) { showToast('ไม่พบโต๊ะ ' + tbl, 'error'); return; }

  // Another table is another game: drop the counted scores, keep the komi.
  if (tbl.toString() !== selectedTable) clearCalc();
  selectedTable = tbl.toString();
  document.getElementById('matchTableNo').textContent = tbl;
  document.getElementById('txtBlack').textContent = m.black || '-';
  document.getElementById('txtWhite').textContent = m.white || '-';
  document.getElementById('txtScore').textContent = m.result || RESULT_PENDING;
  document.getElementById('btnWinB').textContent = m.black || '-';
  document.getElementById('btnWinW').textContent = m.white || '-';

  const done = m.result !== RESULT_PENDING;
  const wb = document.getElementById('winnerBtns');
  wb.className = (done || isHistoryMode || isLocked) ? 'winner-btns locked' : 'winner-btns';

  const cancelArea = document.getElementById('cancelResultArea');
  cancelArea.classList.toggle('hidden', !done || isHistoryMode);

  // "ไม่มา" tags on the card + the walkover quick action. Only when exactly one
  // side is absent (and the opponent is a real player) does the one-tap
  // "give the win" button appear; both-absent gets a passive note instead.
  const aB = _isRealPlayer(m.black) && _effectiveAbsent(m.table, 'B', m.absentB);
  const aW = _isRealPlayer(m.white) && _effectiveAbsent(m.table, 'W', m.absentW);
  document.getElementById('absentTagB').classList.toggle('hidden', !aB);
  document.getElementById('absentTagW').classList.toggle('hidden', !aW);

  const qa = document.getElementById('absentQuickArea');
  const canWrite = !done && !isHistoryMode && !isLocked;
  if (canWrite && aB !== aW && _isRealPlayer(aB ? m.white : m.black)) {
    const winner = aB ? 'White Win' : 'Black Win';
    const oppName = aB ? m.white : m.black;
    qa.innerHTML = `<button type="button" class="btn-absent-win" data-act="absentWin" data-winner="${esc(winner)}">⚡ ให้ ${esc(oppName)} ชนะ (ขาดแข่ง)</button>`;
    qa.classList.remove('hidden');
  } else if (canWrite && aB && aW) {
    qa.innerHTML = '<div class="absent-quick-note">⚠️ ไม่มาทั้งสองฝ่าย — เลือกผลเองด้านล่าง หรือแจ้งผู้จัดการแข่งขัน</div>';
    qa.classList.remove('hidden');
  } else {
    qa.innerHTML = '';
    qa.classList.add('hidden');
  }

  const area = document.getElementById('matchArea');
  area.classList.remove('hidden');
  // Compare via dataset instead of splicing the table number into a CSS
  // selector — a table_no containing a quote would make querySelector throw and
  // take the whole console down with it.
  const wanted = tbl.toString();
  document.querySelectorAll('.grid-cell').forEach(c => {
    c.classList.remove('selected');
    if (c.dataset.table === wanted) c.classList.add('selected');
  });
  setTimeout(() => area.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
}

function closeMatchArea() {
  selectedTable = null;
  document.getElementById('matchArea').classList.add('hidden');
  document.querySelectorAll('.grid-cell').forEach(c => c.classList.remove('selected'));
}

let pendingWinner = null;
let pendingRemark = null;   // e.g. 'ขาดแข่ง' from the no-show quick action

function confirmSubmit(winner, remark) {
  // Say WHY the buttons are dead. "รอบนี้ปิดแล้ว" with no explanation sent
  // judges hunting for a broken app; a previous round can only be corrected
  // through the organiser (/admin/live) or by re-pairing.
  if (isHistoryMode) {
    showToast('🔒 รอบนี้ปิดแล้ว (มีรอบใหม่แล้ว) — แก้ผลย้อนหลังได้ที่ผู้จัดการแข่งขัน', 'error');
    return;
  }
  if (isLocked) { showToast('🔒 ส่งผลครบแล้วทุกโต๊ะในรอบนี้', 'error'); return; }
  if (!currentUser) { showToast('กรุณาเข้าสู่ระบบก่อนส่งผล', 'error'); return; }

  pendingWinner = winner;
  pendingRemark = remark || null;
  const tbl = selectedTable;
  if (!tbl) { showToast('ไม่ได้เลือกโต๊ะ', 'error'); return; }
  const black = document.getElementById('txtBlack').textContent;
  const white = document.getElementById('txtWhite').textContent;
  const winnerName = winner === 'Black Win' ? black : white;
  const winnerColor = winner === 'Black Win' ? '⚫ ดำ' : '⚪ ขาว';

  document.getElementById('confirmMatchInfo').innerHTML =
    `โต๊ะ <strong>${esc(tbl)}</strong> — ${esc(black)} vs ${esc(white)}`;
  document.getElementById('confirmWinnerInfo').innerHTML =
    `🏆 ผู้ชนะ: <strong>${winnerColor} — ${esc(winnerName)}</strong>` +
    (pendingRemark ? ` <span style="color:var(--yellow)">(${esc(pendingRemark)})</span>` : '');
  document.getElementById('confirmUserInfo').innerHTML =
    `ส่งโดย: <strong>${esc(currentUser)}</strong>`;

  const yesBtn = document.getElementById('confirmYesBtn');
  yesBtn.onclick = () => doSubmitResult();
  openModal('confirmModal');
}

// The result code the server will store for a winner label, so the optimistic
// overlay holds the same value the next poll will report.
function _resultCodeFor(winner) {
  return winner === 'Black Win' ? RESULT_BLACK_WIN
    : winner === 'White Win' ? RESULT_WHITE_WIN
    : RESULT_PENDING;
}

async function doSubmitResult() {
  closeModal('confirmModal');
  if (!pendingWinner) return;
  const tbl = selectedTable;
  // The pair as displayed, sent with the write: the server refuses the result
  // if this table now holds different players (MacMahon reuses table numbers,
  // so "the row still exists" is not proof it is the same match).
  const m = (matchData.matches || []).find(x => x.table.toString() === String(tbl));
  const item = {
    tid: LIVE_TID, divId: currentDiv, round: currentRound, table: tbl,
    winner: pendingWinner, submittedBy: currentUser,
    remark: pendingRemark || undefined,
    black: m ? m.black : undefined, white: m ? m.white : undefined,
  };
  try {
    const res = await fetch(`/api/divisions/${currentDiv}/result`, {
      method: 'PUT',
      headers: _writeHeaders(),
      body: JSON.stringify({
        round: currentRound, table: tbl, winner: pendingWinner,
        submittedBy: currentUser, remark: pendingRemark || undefined,
        black: item.black, white: item.white,
      })
    });
    const data = await res.json().catch(() => ({}));
    if (data.success) {
      // Hold the submitted value until a poll reports it, so a stale snapshot
      // cannot flip the cell back to pending under the judge.
      pendingResults[String(tbl)] = { result: _resultCodeFor(pendingWinner), ts: Date.now() };
      closeMatchArea();
      showToast('✅ บันทึกสำเร็จ', 'success');
      await loadDivData();
    } else if (data.code === 'MATCH_NOT_FOUND') {
      // The round was re-uploaded from MacMahon under us — this table no longer
      // exists, so the write went nowhere. Resync rather than leave the judge
      // believing it saved.
      showToast('⚠️ คู่นี้ไม่อยู่ในตารางแล้ว (รอบถูกอัปเดต) — โหลดใหม่แล้วส่งอีกครั้ง', 'error');
      await loadDivData();
    } else if (data.code === 'MATCH_CHANGED') {
      // The table is still there but holds another pair now. Never queue this:
      // the result belongs to two players who are no longer at that table.
      showToast('⚠️ โต๊ะนี้เปลี่ยนคู่แล้ว — ผลไม่ถูกบันทึก กรุณาตรวจตารางใหม่แล้วส่งผลของคู่ปัจจุบัน', 'error');
      await loadDivData();
    } else if (res.status === 429 || res.status >= 500) {
      // Rate limited or a server fault — the judge did nothing wrong and the
      // result must not evaporate into a toast. Queue it like a network drop.
      enqueueResult(item);
      closeMatchArea();
      showToast('📥 ระบบไม่ว่าง — เก็บผลไว้ให้แล้ว จะส่งอัตโนมัติอีกครั้ง', 'error');
    } else { showToast('Error: ' + (data.error || ('HTTP ' + res.status)), 'error'); }
  } catch {
    // Network failure — hold the result rather than lose it.
    enqueueResult(item);
    closeMatchArea();
    showToast('📥 ส่งไม่สำเร็จ (เน็ตขัดข้อง) — เก็บผลไว้ให้แล้ว จะส่งอัตโนมัติเมื่อเชื่อมต่อได้', 'error');
  }
  pendingWinner = null;
  pendingRemark = null;
}

// ─── Offline result queue ─────────────────────────────────────
// Check-in and "ไม่มา" already retry (_putCheckin/_putAbsent), but submitting a
// RESULT — the one write the whole console exists for — had no retry and no
// queue: one failed fetch on venue wifi showed a toast, cleared pendingWinner,
// and the result was simply gone. The judge had to notice and re-enter it.
//
// Results are held in localStorage so they survive a reload or the webview
// being killed, and replayed when the connection returns. Replay is safe
// against double-sending: the endpoint sets a table's result, so writing the
// same winner twice lands on the same state.
const QUEUE_KEY = 'tesuji_judge_queue';
let _queue = [];
let _flushing = false;
let _flushTimer = null;

function _loadQueue() {
  _queue = _lsJSON(QUEUE_KEY, [], Array.isArray);
  renderQueueBar();
}

function _saveQueue() {
  _lsSet(QUEUE_KEY, JSON.stringify(_queue));
  renderQueueBar();
}

function renderQueueBar() {
  const el = document.getElementById('queueBar');
  if (!el) return;
  if (_queue.length === 0) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  el.textContent = '⏳ ผลที่ยังส่งไม่สำเร็จ ' + _queue.length +
    ' รายการ — ระบบจะส่งให้เองเมื่อเชื่อมต่อได้ อย่าเพิ่งปิดหน้านี้';
}

function enqueueResult(item) {
  _queue.push(item);
  _saveQueue();
  scheduleFlush(4000);
}

function scheduleFlush(ms) {
  clearTimeout(_flushTimer);
  _flushTimer = setTimeout(flushQueue, ms);
}

async function flushQueue() {
  if (_flushing || _queue.length === 0) return;
  if (!navigator.onLine) { scheduleFlush(8000); return; }
  _flushing = true;
  let sent = 0;
  try {
    while (_queue.length) {
      const item = _queue[0];
      // A result queued on another tournament's console must never be replayed
      // through this tournament's token — the server would refuse it anyway,
      // but say so instead of retrying it forever. (Items from before the
      // per-tournament change carry no tid; the server decides for those.)
      if (item.tid && item.tid !== LIVE_TID) {
        _queue.shift(); _saveQueue();
        showToast('⚠️ ผลโต๊ะ ' + item.table + ' (รอบ ' + item.round +
          ') เป็นของงานอื่น — ไม่ได้ส่ง กรุณาส่งจากหน้ากรรมการของงานนั้น', 'error');
        continue;
      }
      let data, status = 0;
      try {
        const res = await fetch(`/api/divisions/${item.divId}/result`, {
          method: 'PUT',
          headers: _writeHeaders(),
          body: JSON.stringify({
            round: item.round, table: item.table, winner: item.winner,
            submittedBy: item.submittedBy, remark: item.remark || undefined,
            // The pair this result was entered against. Items queued before
            // this shipped carry neither, and the server then accepts them as
            // it always did rather than rejecting a judge's saved work.
            black: item.black, white: item.white,
          })
        });
        status = res.status;
        data = await res.json().catch(() => ({}));
      } catch {
        break; // still unreachable — keep everything and try again later
      }
      if (data.success) { _queue.shift(); _saveQueue(); sent++; continue; }
      if (status === 429) {
        // Not this result's fault — every judge is writing at once. Keep the
        // whole queue and let the backoff below try again.
        break;
      }
      if (status === 401 || status === 403 || status === 404) {
        // This token can't write that division (a division of another
        // tournament, or a rotated token). Retrying can never succeed.
        _queue.shift(); _saveQueue();
        showToast('⚠️ ผลโต๊ะ ' + item.table + ' (รอบ ' + item.round +
          ') ส่งไม่ได้ — ลิงก์นี้ไม่มีสิทธิ์ส่งผลรุ่นนั้น กรุณาส่งผลใหม่จากลิงก์ที่ถูกต้อง', 'error');
        continue;
      }
      if (data.code === 'MATCH_NOT_FOUND' || data.code === 'MATCH_CHANGED') {
        // The round was re-uploaded from MacMahon while this sat in the queue,
        // so replaying it would write against a pairing the judge never saw —
        // either the table is gone (NOT_FOUND) or it now holds another pair
        // (CHANGED, which the names in the payload are there to catch).
        // Drop it — but never quietly.
        _queue.shift(); _saveQueue();
        showToast('⚠️ ผลโต๊ะ ' + item.table + ' (รอบ ' + item.round +
          ') ส่งไม่ได้ เพราะตารางถูกอัปเดตแล้ว กรุณาส่งผลใหม่', 'error');
        continue;
      }
      break; // an error we do not understand — keep it rather than lose it
    }
  } finally {
    _flushing = false;
    if (_queue.length) scheduleFlush(15000);
  }
  if (sent > 0) {
    showToast('✅ ส่งผลที่ค้างไว้แล้ว ' + sent + ' รายการ', 'success');
    await loadDivData();
  }
}

// ─── Cancel Result ────────────────────────────────────────────
function confirmCancelResult() {
  if (!currentUser) { showToast('กรุณาเข้าสู่ระบบก่อน', 'error'); return; }
  if (!selectedTable) return;

  const tbl = selectedTable;
  const black = document.getElementById('txtBlack').textContent;
  const white = document.getElementById('txtWhite').textContent;

  document.getElementById('confirmMatchInfo').innerHTML =
    `โต๊ะ <strong>${esc(tbl)}</strong> — ${esc(black)} vs ${esc(white)}`;
  document.getElementById('confirmWinnerInfo').innerHTML =
    `⚠️ <strong style="color:var(--red)">ยกเลิกผลการแข่งขัน</strong>`;
  document.getElementById('confirmUserInfo').innerHTML =
    `ยกเลิกโดย: <strong>${esc(currentUser)}</strong>`;

  const yesBtn = document.getElementById('confirmYesBtn');
  yesBtn.onclick = () => doCancelResult();
  openModal('confirmModal');
}

async function doCancelResult() {
  closeModal('confirmModal');
  const tbl = selectedTable;
  if (!tbl) return;
  const m = (matchData.matches || []).find(x => x.table.toString() === String(tbl));
  const item = {
    tid: LIVE_TID, divId: currentDiv, round: currentRound, table: tbl,
    winner: 'CANCEL', submittedBy: currentUser,
    black: m ? m.black : undefined, white: m ? m.white : undefined,
  };
  try {
    const res = await fetch(`/api/divisions/${currentDiv}/result`, {
      method: 'PUT',
      headers: _writeHeaders(),
      body: JSON.stringify({
        round: currentRound, table: tbl, winner: 'CANCEL',
        submittedBy: currentUser, black: item.black, white: item.white,
      })
    });
    const data = await res.json().catch(() => ({}));
    if (data.success) {
      pendingResults[String(tbl)] = { result: RESULT_PENDING, ts: Date.now() };
      closeMatchArea();
      showToast('✅ ยกเลิกผลแล้ว', 'success');
      await loadDivData();
    } else if (data.code === 'MATCH_NOT_FOUND') {
      showToast('⚠️ คู่นี้ไม่อยู่ในตารางแล้ว (รอบถูกอัปเดต) — โหลดใหม่อีกครั้ง', 'error');
      await loadDivData();
    } else if (data.code === 'MATCH_CHANGED') {
      showToast('⚠️ โต๊ะนี้เปลี่ยนคู่แล้ว — ไม่ได้ยกเลิกผล กรุณาตรวจตารางใหม่', 'error');
      await loadDivData();
    } else if (res.status === 429 || res.status >= 500) {
      enqueueResult(item);
      closeMatchArea();
      showToast('📥 ระบบไม่ว่าง — เก็บคำสั่งไว้ให้แล้ว จะส่งอัตโนมัติอีกครั้ง', 'error');
    } else { showToast('Error: ' + (data.error || ('HTTP ' + res.status)), 'error'); }
  } catch {
    enqueueResult(item);
    closeMatchArea();
    showToast('📥 ยกเลิกไม่สำเร็จ (เน็ตขัดข้อง) — เก็บคำสั่งไว้ให้แล้ว จะส่งอัตโนมัติเมื่อเชื่อมต่อได้', 'error');
  }
}

// ─── Toast ────────────────────────────────────────────────────
function showToast(msg, type = 'info') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast ' + type;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = 'toast hidden'; }, 3000);
}

// ─── Tab: ดูผล ───────────────────────────────────────────────
// Score is m.blackScore/m.whiteScore — MacMahon's wins-so-far, carried with
// the pairing itself (live_match.black_score/white_score), never computed here.
function _nameWithScore(name, score) {
  const scoreHTML = score != null ? ` <span style="color:var(--text-dim);font-size:11px">(${esc(String(score))})</span>` : '';
  return `${esc(name) || '-'}${scoreHTML}`;
}

function renderResults() {
  const tbody = document.getElementById('resultsTbody');
  const matches = matchData.matches || [];
  if (matches.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-cell">ยังไม่มีข้อมูลในรอบนี้</td></tr>';
    return;
  }
  tbody.innerHTML = matches.map(m => {
    const done = m.result !== RESULT_PENDING;
    const bWin = done && m.result === RESULT_BLACK_WIN;
    const wWin = done && m.result === RESULT_WHITE_WIN;
    const resCls = done ? 'res-done' : 'res-pending';
    const bCls = bWin ? 'winner-name' : '';
    const wCls = wWin ? 'winner-name' : '';
    return `<tr>
      <td class="table-no">${esc(m.table)}</td>
      <td class="${bCls}" title="${esc(m.black)}">${_nameWithScore(m.black, m.blackScore)}</td>
      <td><span class="res-badge ${resCls}">${esc(m.result)}</span></td>
      <td class="${wCls}" title="${esc(m.white)}" style="text-align:right">${_nameWithScore(m.white, m.whiteScore)}</td>
    </tr>`;
  }).join('');
}

// ─── Tab: เช็คชื่อ ───────────────────────────────────────────
// Optimistic check-in state that survives the 3s snapshot poll. Keyed by
// "table|side" → { val, ts }. Without it, tapping a box optimistically checks it,
// but the next poll re-renders from server data that hasn't caught up to the write
// yet → the box visually reverts ("มันหลุด"), so judges think it failed and re-tap
// (double check-in). We keep the tapped value until a poll confirms the server
// agrees, or a short TTL elapses as a safety valve. Cleared on division/round
// change (keys are only unique within the current view).
let pendingCheckins = {};
const CHECKIN_TTL_MS = 30000;

// The same overlay, for RESULTS. loadDivData() re-reads the division with
// Cache-Control: no-store, so a just-submitted result is there immediately —
// but the 3s poll reads /live/snapshot, which the CDN serves with
// s-maxage=3, stale-while-revalidate=27, so it can hand back a copy up to 30s
// old. handleMsg replaces allDivData wholesale and re-applies it, which turned
// the judge's green cell back to red (and made the "ส่งผลครบแล้ว" lock appear
// and disappear) until the edge caught up. Judges read that as a failed write
// and submit again. Keyed by table → { result, ts }, same TTL as check-in.
let pendingResults = {};

function _withPendingResult(m) {
  const p = pendingResults[m.table];
  if (!p) return m;
  if (p.result === m.result || (Date.now() - p.ts) > CHECKIN_TTL_MS) {
    delete pendingResults[m.table];   // server agrees, or we gave up waiting
    return m;
  }
  return { ...m, result: p.result };
}

function _effectiveCheck(table, side, serverVal) {
  const key = table + '|' + side;
  const p = pendingCheckins[key];
  if (!p) return serverVal;
  if (p.val === serverVal || (Date.now() - p.ts) > CHECKIN_TTL_MS) {
    delete pendingCheckins[key];   // confirmed by the server, or gave up waiting
    return serverVal;
  }
  return p.val;                     // write not visible yet — hold the tapped value
}

// "ไม่มา" (absent) mirrors check-in: same optimistic overlay, same TTL. A side
// is either checked-in OR absent, never both — the server clears the opposite
// bit atomically, and the pending maps mirror that locally for instant UI.
let pendingAbsents = {};
let attBusy = {};                   // "table|side" → write in flight (dims the cell)

// MacMahon writes this literal name for an empty bye seat; Force blanks a
// doubled player to it too. Those seats get no attendance controls.
const ATT_BYE_NAME = 'ไม่มีผู้เข้าแข่งขัน';
function _isRealPlayer(name) {
  return !!name && name !== '-' && name !== 'BYE' && name !== ATT_BYE_NAME;
}

function _effectiveAbsent(table, side, serverVal) {
  const key = table + '|' + side;
  const p = pendingAbsents[key];
  if (!p) return serverVal;
  if (p.val === serverVal || (Date.now() - p.ts) > CHECKIN_TTL_MS) {
    delete pendingAbsents[key];
    return serverVal;
  }
  return p.val;
}

// One attendance cell: [✓ มา] [✕ ไม่มา] segmented buttons, exclusive per side.
// Tapping a lit button clears it. BYE / empty seats get a dash, no controls.
function _attCell(table, side, name, serverCheck, serverAbsent) {
  if (!_isRealPlayer(name)) return '<td class="td-check td-bye">—</td>';
  const c = _effectiveCheck(table, side, serverCheck);
  const a = _effectiveAbsent(table, side, serverAbsent);
  const key = table + '|' + side;
  const dis = isHistoryMode ? ' disabled' : '';
  return `<td class="td-check${attBusy[key] ? ' checking' : ''}">
    <div class="att-seg">
      <button type="button" class="att-btn att-in${c ? ' on' : ''}"${dis}
        data-act="checkin" data-table="${esc(table)}" data-side="${side}" data-on="${!c}" aria-label="มาแล้ว">✓</button>
      <button type="button" class="att-btn att-abs${a ? ' on' : ''}"${dis}
        data-act="absent" data-table="${esc(table)}" data-side="${side}" data-on="${!a}" aria-label="ไม่มา">✕</button>
    </div></td>`;
}

// Round-scoped no-show list — what the organizer reads off when excluding
// players from the next round's pairing in MacMahon.
function _renderAbsentSummary(matches) {
  const sum = document.getElementById('absentSummary');
  if (!sum) return;
  const absentNames = [];
  matches.forEach(m => {
    if (_isRealPlayer(m.black) && _effectiveAbsent(m.table, 'B', m.absentB)) absentNames.push(m.black);
    if (_isRealPlayer(m.white) && _effectiveAbsent(m.table, 'W', m.absentW)) absentNames.push(m.white);
  });
  sum.classList.toggle('hidden', absentNames.length === 0);
  sum.innerHTML = absentNames.length
    ? `✕ ไม่มารอบนี้: ${absentNames.map(esc).join(', ')} <b>(${absentNames.length} คน)</b>`
    : '';
}

function renderCheckin() {
  const tbody = document.getElementById('checkinTbody');
  const matches = matchData.matches || [];
  _renderAbsentSummary(matches);
  if (matches.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-cell">ยังไม่มีข้อมูลในรอบนี้</td></tr>';
    return;
  }
  tbody.innerHTML = matches.map(m => {
    const forceBtn = (isLocked || isHistoryMode)
      ? '' : `<button class="btn-force" data-act="openForce" data-table="${esc(m.table)}" data-black="${esc(m.black)}" data-white="${esc(m.white)}">Force</button>`;
    return `
      <tr>
        <td class="td-table" rowspan="2">${esc(m.table)}</td>
        <td class="name-black">${esc(m.black) || '-'}</td>
        ${_attCell(m.table, 'B', m.black, m.checkB, m.absentB)}
        <td class="td-force" rowspan="2">${forceBtn}</td>
      </tr>
      <tr class="row-border">
        <td class="name-white">${esc(m.white) || '-'}</td>
        ${_attCell(m.table, 'W', m.white, m.checkW, m.absentW)}
      </tr>
    `;
  }).join('');
}

async function doCheckin(table, side, checked) {
  if (isHistoryMode) return;
  const key = table + '|' + side;
  // Optimistic: remember the tapped value so poll re-renders don't revert it.
  // Checking in also clears the same side's absent mark (server does the same).
  pendingCheckins[key] = { val: checked, ts: Date.now() };
  if (checked) pendingAbsents[key] = { val: false, ts: Date.now() };
  attBusy[key] = true;
  renderCheckin();

  const ok = await _putCheckin(table, side, checked);

  delete attBusy[key];
  if (ok !== true) {
    delete pendingCheckins[key];   // give up optimistic → fall back to server truth
    if (checked) delete pendingAbsents[key];
    if (ok === 'gone') {
      // The round was re-uploaded — this table no longer exists, so "tap again"
      // would be a lie. Pull the new table in instead.
      showToast('⚠️ ตารางรอบนี้เปลี่ยนแล้ว — กำลังโหลดใหม่', 'error');
      await loadDivData();
    } else if (ok === 'busy') {
      showToast('⏳ ระบบกำลังรับข้อมูลหนาแน่น — รอสักครู่แล้วกดใหม่', 'error');
    } else {
      showToast('⚠️ เช็คชื่อไม่สำเร็จ ลองกดใหม่อีกครั้ง', 'error');
    }
  }
  // On success keep the pending values until a poll confirms them (the
  // _effective* helpers clear them) so nothing flickers back mid-write.
  renderCheckin();
  renderStatus();
}

// PUT with a couple of quick retries — venue wifi/4G drops a lot, and a single
// silent failure is exactly the "กดแล้วส่งไม่ไป" the judges hit.
async function _putCheckin(table, side, checked, attempt = 0) {
  try {
    const res = await fetch(`/api/divisions/${currentDiv}/checkin`, {
      method: 'PUT',
      headers: _writeHeaders(),
      body: JSON.stringify({ round: currentRound, table, side, checked })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success) return true;
    // 409 = the row is gone (round re-uploaded). Retrying can never succeed;
    // report it distinctly so the caller resyncs instead of saying "tap again".
    if (res.status === 409) return 'gone';
    // 429 = the rate limiter. Two more attempts inside a second only deepen
    // the hole, and the window is 10s — report it and let the judge re-tap.
    if (res.status === 429) return 'busy';
    throw new Error(data.error || ('HTTP ' + res.status));
  } catch (e) {
    if (attempt < 2) {
      await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
      return _putCheckin(table, side, checked, attempt + 1);
    }
    return false;
  }
}

// "ไม่มา" twin of doCheckin/_putCheckin. Marking absent clears the same side's
// check-in (server-side atomically; mirrored here for instant UI).
async function doAbsent(table, side, absent) {
  if (isHistoryMode) return;
  const key = table + '|' + side;
  pendingAbsents[key] = { val: absent, ts: Date.now() };
  if (absent) pendingCheckins[key] = { val: false, ts: Date.now() };
  attBusy[key] = true;
  renderCheckin();

  const ok = await _putAbsent(table, side, absent);

  delete attBusy[key];
  if (ok !== true) {
    delete pendingAbsents[key];
    if (absent) delete pendingCheckins[key];
    if (ok === 'gone') {
      showToast('⚠️ ตารางรอบนี้เปลี่ยนแล้ว — กำลังโหลดใหม่', 'error');
      await loadDivData();
    } else if (ok === 'busy') {
      showToast('⏳ ระบบกำลังรับข้อมูลหนาแน่น — รอสักครู่แล้วกดใหม่', 'error');
    } else {
      showToast('⚠️ บันทึก "ไม่มา" ไม่สำเร็จ ลองกดใหม่อีกครั้ง', 'error');
    }
  }
  renderCheckin();
  renderStatus();
}

async function _putAbsent(table, side, absent, attempt = 0) {
  try {
    const res = await fetch(`/api/divisions/${currentDiv}/absent`, {
      method: 'PUT',
      headers: _writeHeaders(),
      body: JSON.stringify({ round: currentRound, table, side, absent })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success) return true;
    if (res.status === 409) return 'gone';   // row gone — see _putCheckin
    if (res.status === 429) return 'busy';   // rate limited — see _putCheckin
    throw new Error(data.error || ('HTTP ' + res.status));
  } catch (e) {
    if (attempt < 2) {
      await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
      return _putAbsent(table, side, absent, attempt + 1);
    }
    return false;
  }
}

// ─── Status Grid ─────────────────────────────────────────────
function renderStatus() {
  const matches = matchData.matches || [];
  if (matches.length === 0) {
    document.getElementById('statusGrid').innerHTML = '<p class="empty-cell" style="grid-column:1/-1">ยังไม่มีข้อมูล</p>';
    document.getElementById('statusSummary').textContent = '';
    return;
  }
  let sent = 0;
  document.getElementById('statusGrid').innerHTML = matches.map(m => {
    const done = m.result !== RESULT_PENDING;
    if (done) sent++;
    const sel = selectedTable === m.table.toString() ? ' selected' : '';
    const aB = _isRealPlayer(m.black) && _effectiveAbsent(m.table, 'B', m.absentB);
    const aW = _isRealPlayer(m.white) && _effectiveAbsent(m.table, 'W', m.absentW);
    const absMark = (aB || aW) ? '<span class="cell-absent">✕</span>' : '';
    return `<div class="grid-cell ${done ? 'done' : 'pending'}${sel}" data-table="${esc(m.table)}" data-act="selectTable">${esc(m.table)}${absMark}</div>`;
  }).join('');
  document.getElementById('statusSummary').textContent = `ส่งแล้ว ${sent} / ${matches.length} คู่`;
}

// ─── Force Pairing ───────────────────────────────────────────
function openForce(table, black, white) {
  currentForceTable = table;
  const names = matchData.allNames || [];
  const opts = '<option value="">-- เลือก --</option>' + names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
  document.getElementById('forceBlackSel').innerHTML = opts;
  document.getElementById('forceWhiteSel').innerHTML = opts;
  document.getElementById('forceBlackSel').value = names.includes(black) ? black : '';
  document.getElementById('forceWhiteSel').value = names.includes(white) ? white : '';
  document.getElementById('forceBlackTxt').value = '';
  document.getElementById('forceWhiteTxt').value = '';
  document.getElementById('forceRemark').value = '';
  document.getElementById('forceTableLbl').textContent = table;
  openModal('forceModal');
}

async function saveForce() {
  const b = document.getElementById('forceBlackTxt').value.trim() || document.getElementById('forceBlackSel').value;
  const w = document.getElementById('forceWhiteTxt').value.trim() || document.getElementById('forceWhiteSel').value;
  if (!b || !w) { showToast('กรุณาระบุชื่อนักกีฬาทั้งสองฝั่ง', 'error'); return; }

  document.getElementById('confirmMatchInfo').innerHTML =
    `Force Pairing โต๊ะ <strong>${esc(currentForceTable)}</strong>`;
  document.getElementById('confirmWinnerInfo').innerHTML =
    `⚫ ${esc(b)} &nbsp;vs&nbsp; ⚪ ${esc(w)}`;
  document.getElementById('confirmUserInfo').innerHTML = '';

  const yesBtn = document.getElementById('confirmYesBtn');
  yesBtn.onclick = async () => {
    closeModal('confirmModal');
    try {
      const res = await fetch(`/api/divisions/${currentDiv}/force`, {
        method: 'PUT',
        headers: _writeHeaders(),
        body: JSON.stringify({ round: currentRound, table: currentForceTable, newBlack: b, newWhite: w, remark: document.getElementById('forceRemark').value })
      });
      const data = await res.json();
      if (data.success) {
        showToast('✅ Force Pairing สำเร็จ', 'success');
        closeModal('forceModal');
        await loadDivData();
      } else {
        // Surface the server's own message instead of a generic one — the
        // important case is MATCH_NOT_FOUND (this table is gone because the
        // round was re-uploaded), where the write was refused outright.
        showToast(data.error || 'เกิดข้อผิดพลาด', 'error');
        if (data.code === 'MATCH_NOT_FOUND') {
          closeModal('forceModal');
          await loadDivData();
        }
      }
    } catch { showToast('ไม่สามารถเชื่อมต่อ server', 'error'); }
  };
  openModal('confirmModal');
}

// ─── Modals ──────────────────────────────────────────────────
// ─── Score calculator (นับคะแนน) ──────────────────────────────
// A calculator and nothing more: it never submits and never touches the winner
// buttons. Judges count territory at the table, type ดำ / ขาว / โคมิ, read off
// who wins by how much, then press the winner button themselves. The collapsed
// state and the last komi are remembered per device — komi is the same all
// day, the scores are not, so selecting another table clears only the scores.
const CALC_OPEN_KEY = 'tesuji_judge_calc_open';
const CALC_KOMI_KEY = 'tesuji_judge_calc_komi';
const CALC_NUM_RE = /^[+-]?(\d+\.?\d*|\.\d+)$/;
const CALC_THAI_DIGITS = '๐๑๒๓๔๕๖๗๘๙';

// '' → null (blank); not a whole or half point → NaN; else the number.
// Strict on purpose: Number('') is 0 and Number('1e21') parses, and either
// would render a confident-looking wrong margin.
function _calcNum(v) {
  const s = String(v ?? '').trim()
    .replace(/[๐-๙]/g, d => String(CALC_THAI_DIGITS.indexOf(d)))
    .replace(',', '.');
  if (s === '') return null;
  if (!CALC_NUM_RE.test(s)) return NaN;
  const n = Number(s);
  return Number.isInteger(n * 2) ? n : NaN;
}

/** Pure — no DOM. Returns { state: 'incomplete' } | { state: 'invalid' } |
 *  { state: 'ok', winner: 'B'|'W'|'J', margin, black, white, komi, whiteTotal,
 *  komiMissing }. A blank komi counts as 0 and is flagged so the UI can show
 *  the 0 rather than hide the omission. Negative komi (reverse komi) is
 *  arithmetic like any other; negative scores are not. */
function _calcScore(black, white, komi) {
  const b = _calcNum(black), w = _calcNum(white), kRaw = _calcNum(komi);
  if (b === null || w === null) return { state: 'incomplete' };
  const komiMissing = kRaw === null;
  const k = komiMissing ? 0 : kRaw;
  if (Number.isNaN(b) || Number.isNaN(w) || Number.isNaN(k) || b < 0 || w < 0) {
    return { state: 'invalid' };
  }
  const whiteTotal = w + k;
  const diff = b - whiteTotal;
  return {
    state: 'ok',
    winner: diff > 0 ? 'B' : diff < 0 ? 'W' : 'J',
    margin: Math.abs(diff),
    black: b, white: w, komi: k, whiteTotal, komiMissing,
  };
}

function _calcEl(id) { return document.getElementById(id); }

function calcScore() {
  const komiVal = _calcEl('calcKomi').value;
  _lsSet(CALC_KOMI_KEY, komiVal);
  const komiNum = _calcNum(komiVal);
  document.querySelectorAll('.calc-chip').forEach(c => {
    c.classList.toggle('active', komiNum !== null && Number(c.textContent) === komiNum);
  });

  const r = _calcScore(_calcEl('calcBlack').value, _calcEl('calcWhite').value, komiVal);
  const out = _calcEl('calcOut');
  if (r.state === 'incomplete') {
    out.className = 'calc-out muted';
    out.textContent = 'กรอกคะแนนทั้งสองฝั่ง';
    return;
  }
  if (r.state === 'invalid') {
    out.className = 'calc-out err';
    out.textContent = 'ใส่ได้เฉพาะจำนวนเต็มหรือ .5';
    return;
  }
  // Numbers only — nothing user-typed reaches this markup as text.
  const sub = `⚫ ดำ ${r.black} · ⚪ ขาว ${r.white} + โคมิ ${r.komi} = ${r.whiteTotal}`;
  const main = r.winner === 'B' ? `⚫ ดำชนะ ${r.margin} แต้ม`
    : r.winner === 'W' ? `⚪ ขาวชนะ ${r.margin} แต้ม`
    : 'เสมอ (jigo)';
  out.className = 'calc-out ' + r.winner.toLowerCase();
  out.innerHTML = `<div class="calc-sub">${sub}</div><div>${main}</div>`;
}

function _setCalcOpen(open) {
  _calcEl('calcBody').classList.toggle('hidden', !open);
  _calcEl('calcChev').textContent = open ? '▴' : '▾';
  _calcEl('calcToggle').setAttribute('aria-expanded', String(open));
}

function toggleCalc() {
  const open = _calcEl('calcBody').classList.contains('hidden');
  _setCalcOpen(open);
  _lsSet(CALC_OPEN_KEY, open ? '1' : '0');
  if (open) _calcEl('calcBlack').focus();
}

function setKomi(v) {
  _calcEl('calcKomi').value = v;
  calcScore();
}

function clearCalc() {
  _calcEl('calcBlack').value = '';
  _calcEl('calcWhite').value = '';
  calcScore();
}

function _initCalc() {
  _setCalcOpen(_lsGet(CALC_OPEN_KEY) === '1');
  const komi = _lsGet(CALC_KOMI_KEY);
  if (komi) _calcEl('calcKomi').value = komi;
  calcScore();
}

function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
function handleModalBg(e, id) { if (e.target.id === id) closeModal(id); }

window.addEventListener('online', () => {
  document.body.classList.remove('offline');
  scheduleFlush(300); // back on the network — drain what is waiting
});
window.addEventListener('offline', () => document.body.classList.add('offline'));

// ─── Init ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  if (!navigator.onLine) document.body.classList.add('offline');
  _initCalc();
  // Results from a previous session (reload, or the webview being killed
  // mid-tournament) are still owed to the server.
  _loadQueue();

  await resolveAuthUser();
  applyLoginState();
  if (!currentUser) {
    // Blocked — no session / no first_name_th on profile. Results already in
    // the queue were entered by a judge who WAS signed in and are owed to the
    // server regardless of who is looking at the screen now; the write is
    // authorised by the token in the URL, not by this session. Draining them
    // was the one thing this early return must not skip.
    if (_queue.length) scheduleFlush(1000);
    return;
  }

  _tick();
  if (_queue.length) scheduleFlush(1000);
});

// ─── Delegated actions ───────────────────────────────────────
// Table numbers and player names reach these handlers through data-* instead of
// being spliced into an inline handler, so they can never be parsed as JS (see
// esc() in common.js). data-on carries a boolean as its string form.
registerActions({
  selectTable: d => selectTable(d.table),
  checkin: d => doCheckin(d.table, d.side, d.on === 'true'),
  absent: d => doAbsent(d.table, d.side, d.on === 'true'),
  openForce: d => openForce(d.table, d.black, d.white),
  absentWin: d => confirmSubmit(d.winner, 'ขาดแข่ง'),
});
