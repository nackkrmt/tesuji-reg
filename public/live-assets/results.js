/* ============================================================
   TESUJI — Live Results Page Logic
   Requires: common.js loaded first
   ============================================================ */

let divData = {}, divMeta = [], standingsData = {};
let currentOpenDiv = null;
let selectedRound = null;

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
  setAnnouncement(msg.announcement || '');
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
  renderLinks();
  if (currentOpenDiv) openModal(currentOpenDiv);
  if (subscriptions.length > 0) {
    checkResultChanges(isFirst);
    renderMyCard();
  }
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

function setAnnouncement(text) {
  const el = document.getElementById('announcementBanner');
  if (!el) return;
  if (text) {
    el.textContent = text;
    el.classList.remove('hidden');
  } else {
    el.classList.add('hidden');
  }
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

  const data = divData[divId] || {};
  const standings = standingsData[divId];
  const rsEl = document.getElementById('roundSelector');

  if (standings && standings.rows && standings.rows.length > 0) {
    rsEl.classList.remove('visible');
    renderStandings(standings);
  } else {
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

  document.getElementById('modalOverlay').classList.add('active');
  document.body.style.overflow = 'hidden';
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

function renderMatches(divId) {
  const data = divData[divId] || {};
  const thead = document.getElementById('modalThead');
  const tbody = document.getElementById('modalBody');

  thead.innerHTML = `<tr>
    <th class="td-center">โต๊ะ</th>
    <th>ดำ</th>
    <th class="td-center">ผล</th>
    <th class="td-right">ขาว</th>
  </tr>`;

  const matches = (data.allMatches || []).filter(m => m.round === selectedRound);

  if (matches.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="td-center" style="color:var(--text-dim);padding:40px">ไม่มีการแข่งขันในรอบนี้</td></tr>`;
  } else {
    tbody.innerHTML = matches.map(m => {
      const isDone = m.result !== RESULT_PENDING;
      const bWin = isDone && m.result === RESULT_BLACK_WIN;
      const wWin = isDone && m.result === RESULT_WHITE_WIN;
      return `
        <tr>
          <td class="td-center" style="color:var(--text-dim);font-weight:700">${m.table}</td>
          <td class="${bWin ? 'winner' : ''}">${m.black || '-'}</td>
          <td class="td-center"><span class="badge ${isDone ? 'done' : 'pending'}">${m.result}</span></td>
          <td class="td-right ${wWin ? 'winner' : ''}">${m.white || '-'}</td>
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

// ── My Status Cards (multi) ──
function buildPlayerCard(divId, playerName, cardIdx = 0) {
  const meta = divMeta.find(d => d.id === divId);
  const divName = meta ? meta.name : divId;
  const data = divData[divId] || {};

  const standings = standingsData[divId];
  if (standings && standings.rows && standings.rows.length > 0) {
    const nameColIdx = 1;
    const placeColIdx = 0;
    const playerRow = standings.rows.find(row => row[nameColIdx]?.toString().trim() === playerName.trim());

    if (!playerRow) {
      return `<div class="my-card-inner">
        <div class="my-card-top">
          <div><div class="my-card-name">👤 ${esc(playerName)}</div><div class="my-card-div">${esc(divName)}</div></div>
          <button class="my-card-edit" onclick="unsubPlayer('${esc(divId)}','${esc(playerName)}')">ยกเลิก ✕</button>
        </div>
        <div class="my-card-sections">
          <div class="my-card-section"><div class="my-card-label">ผลการแข่งขัน</div><div class="my-card-result pending">ไม่พบข้อมูล</div></div>
        </div>
      </div>`;
    }

    const place = playerRow[placeColIdx]?.toString() || '?';
    let medal = '';
    if (place === '1') medal = '🥇';
    else if (place === '2') medal = '🥈';
    else if (place === '3') medal = '🥉';
    else medal = `#${place}`;

    const cols = standings.headers.slice(2).map((h, i) => ({ header: h, value: playerRow[i + 2] || '-' }));
    const scoreEntry = cols.find(e => e.header.toLowerCase() === 'score');
    const scoreVal = scoreEntry ? scoreEntry.value : '-';
    const roundEntries = cols.filter(e => /^\d+$/.test(e.header)).sort((a, b) => parseFloat(a.header) - parseFloat(b.header));
    const statEntries = cols.filter(e => e.header.toLowerCase() !== 'score' && !/^\d+$/.test(e.header));

    let roundsHTML = '';
    if (roundEntries.length > 0) {
      roundsHTML = `<div class="card-stat-row">
        <div class="my-card-label">ผลแต่ละรอบ</div>
        <div class="round-results">${roundEntries.map(e =>
          `<div class="round-cell"><div class="round-cell-num">R${esc(e.header)}</div><div class="round-cell-val">${esc(e.value)}</div></div>`
        ).join('')}</div>
      </div>`;
    }

    let statsHTML = '';
    if (statEntries.length > 0) {
      statsHTML = `<div class="card-stat-row">
        <div class="round-results">${statEntries.map(e =>
          `<div class="round-cell"><div class="round-cell-num">${esc(e.header)}</div><div class="round-cell-val">${esc(e.value)}</div></div>`
        ).join('')}</div>
      </div>`;
    }

    return `<div class="my-card-inner">
      <div class="my-card-top">
        <div><div class="my-card-name">👤 ${esc(playerName)}</div><div class="my-card-div">${esc(divName)}</div></div>
        <button class="my-card-edit" onclick="unsubPlayer('${esc(divId)}','${esc(playerName)}')">ยกเลิก ✕</button>
      </div>
      <div id="ct-${cardIdx}" class="card-timer-inline"></div>
      <div class="my-card-sections">
        <div class="my-card-section">
          <div class="my-card-label">อันดับ</div>
          <div class="my-card-result win" style="font-size:28px">${medal}</div>
          <div class="my-card-sub">อันดับที่ ${esc(place)}</div>
        </div>
        <div class="my-card-section">
          <div class="my-card-label">Score</div>
          <div class="my-card-result win" style="font-size:28px">${esc(scoreVal)}</div>
        </div>
      </div>
      ${roundsHTML}
      ${statsHTML}
      <button class="my-card-history-btn" onclick="openHistModal('${esc(divId)}','${esc(playerName)}')">📊 ดูผลงานทุกรอบ</button>
    </div>`;
  }

  const allMatches = (data.allMatches || []).filter(m => m.black === playerName || m.white === playerName);
  const done = allMatches.filter(m => m.result !== RESULT_PENDING).sort((a,b) => parseFloat(b.round)-parseFloat(a.round));
  const pending = allMatches.filter(m => m.result === RESULT_PENDING).sort((a,b) => parseFloat(a.round)-parseFloat(b.round));
  const latestDone = done[0] || null;
  const nextMatch = pending[0] || null;

  let resultHTML = '';
  if (latestDone) {
    const iB = latestDone.black === playerName;
    const won = (iB && latestDone.result === RESULT_BLACK_WIN) || (!iB && latestDone.result === RESULT_WHITE_WIN);
    resultHTML = `<div class="my-card-label">รอบ ${esc(latestDone.round)} — ผลล่าสุด</div>
      <div class="my-card-result ${won?'win':'loss'}">${won?'🏆 ชนะ':'💔 แพ้'}</div>
      <div class="my-card-sub">vs ${esc(iB?latestDone.white:latestDone.black)} · โต๊ะ ${esc(latestDone.table)}</div>`;
  } else {
    resultHTML = `<div class="my-card-label">ผลล่าสุด</div><div class="my-card-result pending">รอผล...</div>`;
  }

  let nextHTML = '';
  if (nextMatch) {
    const iB = nextMatch.black === playerName;
    const opp = iB ? nextMatch.white : nextMatch.black;
    nextHTML = `<div class="my-card-label">รอบ ${esc(nextMatch.round)} — คู่ต่อไป</div>
      <div class="my-card-vs">${esc(opp)||'รอจับคู่'}</div>
      <div class="my-card-table">โต๊ะ ${esc(nextMatch.table)} · ${iB?'⚫ ดำ':'⚪ ขาว'}</div>`;
  } else {
    nextHTML = `<div class="my-card-label">รอบถัดไป</div>
      <div class="my-card-vs" style="color:var(--text-dim)">${latestDone?'รอประกาศ':'—'}</div>`;
  }

  return `<div class="my-card-inner">
    <div class="my-card-top">
      <div><div class="my-card-name">👤 ${esc(playerName)}</div><div class="my-card-div">${esc(divName)}</div></div>
      <button class="my-card-edit" onclick="unsubPlayer('${esc(divId)}','${esc(playerName)}')">ยกเลิก ✕</button>
    </div>
    <div id="ct-${cardIdx}" class="card-timer-inline"></div>
    <div class="my-card-sections">
      <div class="my-card-section">${resultHTML}</div>
      <div class="my-card-section">${nextHTML}</div>
    </div>
    <button class="my-card-history-btn" onclick="openHistModal('${esc(divId)}','${esc(playerName)}')">📊 ดูผลงานทุกรอบ</button>
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
          <div class="hist-meta">โต๊ะ ${esc(m.table)} &middot; ${iB ? '⚫ ดำ' : '⚪ ขาว'}</div>
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
  card.innerHTML = `<div class="my-cards-list">${subscriptions.map((s, i) => buildPlayerCard(s.divId, s.playerName, i)).join('')}</div>`;
  subscriptions.forEach((s, i) => renderRoundTimer(`ct-${i}`, s.divId));
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
