// Serves the v1 judge console (reference/tesuji-v1/public/index.html) verbatim as a
// raw Route Handler — same approach as /live (app/live/route.ts): bypasses
// app/layout.tsx so there's no reg-app chrome, asset paths repointed to
// /live-assets/*, and the client logic lives in public/live-assets/judge.js.
//
// The [key] segment is the live_token — the unguessable secret that authorizes
// result / check-in / force writes. We validate it up front (live_check_token); an
// invalid link renders a friendly error instead of the console. The token plus the
// public Supabase URL/anon key are injected as window globals for judge.js.

import { getServerSupabase } from "@/lib/live/serverData";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// JSON string safe to drop into an inline <script> (guards against </script> etc.).
function jsLiteral(v: string): string {
  return JSON.stringify(v).replace(/</g, "\\u003c");
}

function errorPage(): string {
  return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TESUJI — ลิงก์ไม่ถูกต้อง</title>
  <link rel="stylesheet" href="/live-assets/shared.css">
  <style>
    body{display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;text-align:center}
    .box{max-width:360px}
    .box h1{font-size:20px;margin:0 0 8px}
    .box p{color:var(--text-muted,#94a3b8);font-size:14px;line-height:1.6;margin:0}
    .stones{font-size:28px;margin-bottom:12px}
  </style>
</head>
<body>
  <div class="box">
    <div class="stones">⚫⚪</div>
    <h1>ลิงก์กรรมการไม่ถูกต้อง</h1>
    <p>ลิงก์นี้ใช้ไม่ได้หรือหมดอายุแล้ว ติดต่อผู้จัดเพื่อขอลิงก์กรรมการใหม่</p>
  </div>
</body>
</html>`;
}

function consolePage(key: string): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "";
  const boot =
    `<script>` +
    `window.__JUDGE_SECRET=${jsLiteral(key)};` +
    `window.__SUPABASE_URL=${jsLiteral(supabaseUrl)};` +
    `window.__SUPABASE_KEY=${jsLiteral(supabaseKey)};` +
    `</script>`;

  return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>TESUJI — ระบบจัดการแข่งขัน</title>
  <meta name="description" content="TESUJI Go Competition Organizer — ระบบส่งผลการแข่งขันหมากล้อม">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <link rel="stylesheet" href="/live-assets/shared.css">
  <link rel="stylesheet" href="/live-assets/style.css">
</head>
<body class="judge-page">

  <!-- Blocked Screen — shown when the visitor isn't a signed-in judge with a
       Thai first name on their profile. No manual name entry anymore: identity
       always comes from the reg-app session (see judge.js resolveAuthUser()). -->
  <div id="loginScreen" class="login-screen">
    <div class="login-card">
      <div class="login-logo">
        <span class="app-logo app-logo-lg"><img src="/logo-mark.svg" alt=""></span>
      </div>
      <h1 class="login-title">TESUJI</h1>
      <p class="login-subtitle">ระบบส่งผลการแข่งขันหมากล้อม</p>
      <p class="login-hint">
        ต้อง Login ที่หน้าเว็บหลักด้วยบัญชีที่มีสิทธิ์กรรมการก่อน และมีชื่อจริงในโปรไฟล์
      </p>
      <a class="login-btn" href="/" style="display:block;text-decoration:none;text-align:center">ไปหน้าเว็บหลัก</a>
    </div>
  </div>

  <!-- Offline Bar -->
  <div id="offlineBar">⚠️ ขาดการเชื่อมต่ออินเทอร์เน็ต</div>

  <div class="page">

    <!-- Header -->
    <header class="header">
      <div class="header-title">
        <span class="app-logo"><img src="/logo-mark.svg" alt=""></span>
        <span class="title-text">TESUJI</span>
      </div>
      <div class="header-right">
        <div id="userBadge" class="user-badge hidden" onclick="showUserMenu()">
          <span id="userAvatar" class="user-avatar">?</span>
          <span id="userName" class="user-name"></span>
        </div>
        <div id="conn" class="conn connecting"></div>
        <button class="btn-theme" id="btnTheme" onclick="toggleTheme()" title="สลับโหมดสว่าง/มืด">☀️</button>
      </div>
    </header>

    <!-- Announcement Banner -->
    <div id="announcementBanner" class="ann-banner hidden"></div>

    <!-- Division + Round -->
    <div class="section pickers">
      <div class="picker-row">
        <label>รุ่น</label>
        <select id="divPicker" onchange="onDivChange()"></select>
      </div>
      <div class="picker-row">
        <label id="roundLabel">รอบ</label>
        <select id="roundPicker" onchange="onRoundChange()"></select>
      </div>
    </div>

    <!-- Lock Banner -->
    <div id="lockBanner" class="lock-banner hidden">🔒 ส่งผลครบแล้วทุกโต๊ะ</div>



    <!-- Tab: ส่งผล + สถานะ (merged) -->
    <div id="tab-submit" class="tab-content active">
      <div class="section">
        <div id="roundTimer"></div>
        <div id="statusGrid" class="status-grid"></div>
        <div id="statusSummary" class="status-summary"></div>
      </div>

      <div id="matchArea" class="section match-area hidden">
        <div class="match-card">
          <div class="match-header">
            <span class="match-table-label">โต๊ะ <span id="matchTableNo" class="accent"></span></span>
            <button class="btn-close-match" onclick="closeMatchArea()" title="ปิด">✕</button>
          </div>
          <div class="match-vs">
            <div class="player-col">
              <span class="stone b sm"></span>
              <span id="txtBlack" class="player-name">-</span>
            </div>
            <div id="txtScore" class="vs-score">?-?</div>
            <div class="player-col right">
              <span id="txtWhite" class="player-name">-</span>
              <span class="stone w sm"></span>
            </div>
          </div>
        </div>
        <p class="choose-label">เลือกผู้ชนะ</p>
        <div id="winnerBtns" class="winner-btns">
          <button id="btnWinB" class="btn-win black" onclick="confirmSubmit('Black Win')"></button>
          <button id="btnWinW" class="btn-win white" onclick="confirmSubmit('White Win')"></button>
        </div>
        <div id="cancelResultArea" class="cancel-result-area hidden">
          <button class="btn-cancel-result" onclick="confirmCancelResult()">⚠️ ยกเลิกผลการแข่งขัน</button>
        </div>
      </div>
    </div>

    <!-- Tab: ดูผล -->
    <div id="tab-results" class="tab-content hidden">
      <div class="section">
        <table class="results-table">
          <thead>
            <tr>
              <th>โต๊ะ</th>
              <th>ชื่อ</th>
              <th>ผล</th>
              <th>ชื่อ</th>
            </tr>
          </thead>
          <tbody id="resultsTbody">
            <tr><td colspan="4" class="empty-cell">เลือกรุ่นและรอบก่อนครับ</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Tab: กำหนดการ -->
    <div id="tab-schedule" class="tab-content hidden">
      <div class="section" style="padding:14px">
        <div id="judgeSchedule"></div>
      </div>
    </div>

    <!-- Tab: เช็คชื่อ -->
    <div id="tab-checkin" class="tab-content hidden">
      <div class="section">
        <table class="checkin-table">
          <thead>
            <tr>
              <th class="th-table">โต๊ะ</th>
              <th>ชื่อ</th>
              <th class="th-check">Check in</th>
              <th class="th-force">Force</th>
            </tr>
          </thead>
          <tbody id="checkinTbody">
            <tr><td colspan="5" class="empty-cell">เลือกรุ่นและรอบก่อนครับ</td></tr>
          </tbody>
        </table>
      </div>
    </div>

  </div><!-- /page -->

  <!-- Bottom Nav (Liquid Glass) -->
  <nav class="bottom-nav">
    <button class="nav-btn active" onclick="switchTab('submit', this)">
      <span class="nav-icon">🟢</span>
      <span class="nav-label">ส่งผล</span>
    </button>
    <button class="nav-btn" onclick="switchTab('results', this)">
      <span class="nav-icon">📊</span>
      <span class="nav-label">ดูผล</span>
    </button>
    <button class="nav-btn" onclick="switchTab('schedule', this)">
      <span class="nav-icon">📅</span>
      <span class="nav-label">กำหนดการ</span>
    </button>
    <button class="nav-btn" onclick="switchTab('checkin', this)">
      <span class="nav-icon">✅</span>
      <span class="nav-label">เช็คชื่อ</span>
    </button>
  </nav>

  <!-- Force Modal -->
  <div id="forceModal" class="modal hidden" onclick="handleModalBg(event,'forceModal')">
    <div class="modal-box">
      <div class="modal-hd">
        <h3>Force Pairing โต๊ะ <span id="forceTableLbl" class="accent"></span></h3>
        <button class="btn-x" onclick="closeModal('forceModal')">✕</button>
      </div>
      <div class="modal-bd">
        <div class="fg"><label>ชื่อ</label>
          <select id="forceBlackSel"></select>
          <input type="text" id="forceBlackTxt" placeholder="หรือพิมพ์ชื่อใหม่...">
        </div>
        <div class="fg"><label>ชื่อ</label>
          <select id="forceWhiteSel"></select>
          <input type="text" id="forceWhiteTxt" placeholder="หรือพิมพ์ชื่อใหม่...">
        </div>
        <div class="fg"><label>หมายเหตุ</label>
          <textarea id="forceRemark" placeholder="เช่น สลับคู่เนื่องจาก..."></textarea>
        </div>
        <div class="modal-actions">
          <button class="btn-danger" onclick="saveForce()">บันทึก</button>
          <button class="btn-ghost" onclick="closeModal('forceModal')">ยกเลิก</button>
        </div>
      </div>
    </div>
  </div>

  <!-- User Menu Modal -->
  <div id="userMenuModal" class="modal hidden" onclick="handleModalBg(event,'userMenuModal')">
    <div class="modal-box">
      <div class="modal-hd">
        <h3>👤 ผู้ใช้งาน</h3>
        <button class="btn-x" onclick="closeModal('userMenuModal')">✕</button>
      </div>
      <div class="modal-bd">
        <div class="user-menu-info">
          <div class="user-menu-avatar" id="userMenuAvatar">?</div>
          <div class="user-menu-name" id="userMenuName">-</div>
          <div class="user-menu-hint">ชื่อที่แสดงนี้จะถูกบันทึกเมื่อส่งผลการแข่งขัน</div>
        </div>
        <div class="modal-actions">
          <a class="btn-ghost" href="/" style="display:block;text-decoration:none;text-align:center">กลับหน้าหลัก</a>
          <button class="btn-ghost" onclick="closeModal('userMenuModal')">ปิด</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Confirm Submit Modal -->
  <div id="confirmModal" class="modal hidden" onclick="handleModalBg(event,'confirmModal')">
    <div class="modal-box">
      <div class="modal-hd">
        <h3>ยืนยันบันทึกผล</h3>
        <button class="btn-x" onclick="closeModal('confirmModal')">✕</button>
      </div>
      <div class="modal-bd">
        <div class="confirm-info">
          <div id="confirmMatchInfo" class="confirm-match"></div>
          <div id="confirmWinnerInfo" class="confirm-winner"></div>
          <div id="confirmUserInfo" class="confirm-user"></div>
        </div>
        <div class="modal-actions">
          <button id="confirmYesBtn" class="btn-confirm-yes">ยืนยัน</button>
          <button class="btn-ghost" onclick="closeModal('confirmModal')">ยกเลิก</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Toast -->
  <div id="toast" class="toast hidden"></div>

  ${boot}
  <script src="/live-assets/common.js"></script>
  <script src="/live-assets/judge.js"></script>
</body>
</html>`;
}

export async function GET(
  _req: Request,
  { params }: { params: { key: string } },
) {
  const key = params.key ?? "";
  let valid = false;
  try {
    const sb = getServerSupabase();
    const { data, error } = await sb.rpc("live_check_token", { p_secret: key });
    valid = !error && data === true;
  } catch {
    valid = false;
  }

  const html = valid ? consolePage(key) : errorPage();
  return new Response(html, {
    status: valid ? 200 : 403,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
