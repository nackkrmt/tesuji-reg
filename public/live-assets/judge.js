/* ============================================================
   TESUJI — Judge Page Logic (index.html clone)
   Requires: common.js loaded first

   Adapted from reference/tesuji-v1/public/app.js for the Supabase backend:
     1. Transport: v1's held-open SSE (/api/events) → poll /live/snapshot every 3s
        (same endpoint the Live page uses; Vercel-serverless friendly).
     2. Submitter identity: always the visitor's real Thai first name, read from
        the reg-app session (profile.first_name_th). There's no manual name entry
        anymore — access is blocked entirely if a name can't be resolved (not
        signed in, or signed in with no first_name_th on their profile).
     3. Writes carry the judge secret (x-admin-token = the [key] in the URL) so the
        token-gated REST endpoints (/api/divisions/:id/{result,checkin,force}) accept
        them. The rest of the file is v1 app.js unchanged.
   ============================================================ */

// Injected by app/judge/[key]/route.ts.
const JUDGE_SECRET = (typeof window !== 'undefined' && window.__JUDGE_SECRET) || '';
const SUPABASE_URL = (typeof window !== 'undefined' && window.__SUPABASE_URL) || '';
const SUPABASE_KEY = (typeof window !== 'undefined' && window.__SUPABASE_KEY) || '';

// Auth headers for the guarded write endpoints.
function _writeHeaders() {
  return { 'Content-Type': 'application/json', 'x-admin-token': JUDGE_SECRET };
}

let divisions = [], allDivData = {};
let currentDiv = null, currentRound = null;
let matchData = { matches: [], rounds: [], allNames: [] };
let isLocked = false, isHistoryMode = false;
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

async function resolveAuthUser() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  const ref = _supabaseRef();
  if (!ref) return;
  let session = null;
  try {
    const raw = localStorage.getItem(`sb-${ref}-auth-token`);
    if (raw) session = JSON.parse(raw);
  } catch { return; }
  if (session && session.currentSession) session = session.currentSession; // older wrap shape
  const token = session && session.access_token;
  const uid = session && session.user && session.user.id;
  if (!token || !uid) return;
  if (session.expires_at && Date.now() / 1000 > session.expires_at) return; // expired
  const authHeaders = { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, Accept: 'application/json' };
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/profile?id=eq.${encodeURIComponent(uid)}&select=first_name_th`,
      { headers: authHeaders }
    );
    if (res.ok) {
      const rows = await res.json();
      const p = Array.isArray(rows) ? rows[0] : null;
      if (p && p.first_name_th) currentUser = p.first_name_th.trim();
    }
  } catch {}
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/account_roles?account_id=eq.${encodeURIComponent(uid)}&select=default_division_id`,
      { headers: authHeaders }
    );
    if (res.ok) {
      const rows = await res.json();
      const r = Array.isArray(rows) ? rows[0] : null;
      if (r && r.default_division_id) judgeDefaultDivision = r.default_division_id;
    }
  } catch {}
}

// ─── Data transport (poll /live/snapshot; replaces v1 SSE) ─────
// v1 held a /api/events SSE stream open. That doesn't fit Vercel's serverless
// model, so — exactly like the Live page (public/live-assets/results.js) — we poll
// a one-shot snapshot every 3s. The payload IS a v1 FULL_UPDATE message, so it
// feeds straight into the unchanged handleMsg() below. ETag/304 keeps polls cheap.
const POLL_MS = 3000;
let _snapshotEtag = null;

async function pollSnapshot() {
  try {
    const res = await fetch('/live/snapshot', {
      cache: 'no-store',
      headers: _snapshotEtag ? { 'If-None-Match': _snapshotEtag } : {},
    });
    if (res.status === 304) { setConn('connected'); return; }
    if (!res.ok) { setConn('disconnected'); return; }
    _snapshotEtag = res.headers.get('ETag');
    handleMsg(await res.json());
  } catch { setConn('disconnected'); }
}

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
  pendingCheckins = {};   // table|side keys aren't unique across divisions
  pendingAbsents = {};
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
  matchData = data;
  const rounds = data.rounds || [];
  const rnd = currentRound || data.currentRound;
  currentRound = rnd;

  const sel = document.getElementById('roundPicker');
  sel.innerHTML = rounds.length === 0
    ? '<option value="">ยังไม่มีรอบ</option>'
    : rounds.map(r => `<option value="${esc(r)}" ${r == rnd ? 'selected' : ''}>รอบที่ ${esc(r)}</option>`).join('');

  isHistoryMode = rounds.length > 0 && rnd != rounds[0];
  const lbl = document.getElementById('roundLabel');
  lbl.textContent = isHistoryMode ? 'ย้อนหลัง' : 'รอบ';
  sel.className = isHistoryMode ? 'history' : '';

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
  pendingCheckins = {};   // table|side keys aren't unique across rounds
  pendingAbsents = {};
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
  if (isHistoryMode || isLocked) { showToast('🔒 ไม่สามารถแก้ไขผลรอบนี้ได้', 'error'); return; }
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

async function doSubmitResult() {
  closeModal('confirmModal');
  if (!pendingWinner) return;
  const tbl = selectedTable;
  try {
    const res = await fetch(`/api/divisions/${currentDiv}/result`, {
      method: 'PUT',
      headers: _writeHeaders(),
      body: JSON.stringify({ round: currentRound, table: tbl, winner: pendingWinner, submittedBy: currentUser, remark: pendingRemark || undefined })
    });
    const data = await res.json();
    if (data.success) {
      closeMatchArea();
      showToast('✅ บันทึกสำเร็จ', 'success');
      await loadDivData();
    } else if (data.code === 'MATCH_NOT_FOUND') {
      // The round was re-uploaded from MacMahon under us — this table no longer
      // exists, so the write went nowhere. Resync rather than leave the judge
      // believing it saved.
      showToast('⚠️ คู่นี้ไม่อยู่ในตารางแล้ว (รอบถูกอัปเดต) — โหลดใหม่แล้วส่งอีกครั้ง', 'error');
      await loadDivData();
    } else { showToast('Error: ' + data.error, 'error'); }
  } catch {
    // Network failure — hold the result rather than lose it.
    enqueueResult({
      divId: currentDiv, round: currentRound, table: tbl,
      winner: pendingWinner, submittedBy: currentUser,
      remark: pendingRemark || undefined,
    });
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
  try {
    const raw = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    _queue = Array.isArray(raw) ? raw : [];
  } catch { _queue = []; }
  renderQueueBar();
}

function _saveQueue() {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(_queue)); } catch {}
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
      let data;
      try {
        const res = await fetch(`/api/divisions/${item.divId}/result`, {
          method: 'PUT',
          headers: _writeHeaders(),
          body: JSON.stringify({
            round: item.round, table: item.table, winner: item.winner,
            submittedBy: item.submittedBy, remark: item.remark || undefined
          })
        });
        data = await res.json().catch(() => ({}));
      } catch {
        break; // still unreachable — keep everything and try again later
      }
      if (data.success) { _queue.shift(); _saveQueue(); sent++; continue; }
      if (data.code === 'MATCH_NOT_FOUND') {
        // The round was re-uploaded from MacMahon while this sat in the queue,
        // so replaying it would write against a pairing the judge never saw.
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
  try {
    const res = await fetch(`/api/divisions/${currentDiv}/result`, {
      method: 'PUT',
      headers: _writeHeaders(),
      body: JSON.stringify({ round: currentRound, table: tbl, winner: 'CANCEL', submittedBy: currentUser })
    });
    const data = await res.json();
    if (data.success) {
      closeMatchArea();
      showToast('✅ ยกเลิกผลแล้ว', 'success');
      await loadDivData();
    } else if (data.code === 'MATCH_NOT_FOUND') {
      showToast('⚠️ คู่นี้ไม่อยู่ในตารางแล้ว (รอบถูกอัปเดต) — โหลดใหม่อีกครั้ง', 'error');
      await loadDivData();
    } else { showToast('Error: ' + data.error, 'error'); }
  } catch {
    enqueueResult({
      divId: currentDiv, round: currentRound, table: tbl,
      winner: 'CANCEL', submittedBy: currentUser,
    });
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
  // Results from a previous session (reload, or the webview being killed
  // mid-tournament) are still owed to the server.
  _loadQueue();

  await resolveAuthUser();
  applyLoginState();
  if (!currentUser) return; // blocked — no session / no first_name_th on profile

  pollSnapshot();
  setInterval(pollSnapshot, POLL_MS);
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
