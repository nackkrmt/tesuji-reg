// Serves the v1 results.html verbatim (see reference/tesuji-v1/public/results.html)
// as a raw Route Handler response — this bypasses app/layout.tsx entirely, so
// there is no PublicHeader / GlassDock / any reg-app chrome on this page. Only
// the asset paths were repointed to /live-assets/*; markup, classes, and modal
// structure are untouched. Client logic lives in public/live-assets/results.js,
// which talks to /live/events (Supabase-backed SSE) instead of the old /api/events.

export const dynamic = "force-dynamic";

const HTML = `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TESUJI — Live Results</title>
  <meta name="description" content="ผลการแข่งขันหมากล้อมสด TESUJI Go Competition Organizer">
  <link rel="stylesheet" href="/live-assets/shared.css">
  <link rel="stylesheet" href="/live-assets/results.css">
</head>
<body class="results-page">

  <!-- Theme Toggle -->
  <div class="results-theme-btn">
    <button class="btn-theme" id="btnTheme" onclick="toggleTheme()" title="สลับโหมดสว่าง/มืด">☀️</button>
  </div>

  <div class="header">
    <div class="logo">
      <span class="app-logo app-logo-lg"><img src="/logo-mark.svg" alt=""></span>
    </div>
    <h1>TESUJI</h1>
    <div class="subtitle">Go Competition Organizer</div>
    <div class="header-badges">
      <div class="live-badge" id="liveBadge">
        <span class="live-dot"></span>
        LIVE
      </div>
      <button class="schedule-badge" onclick="openScheduleModal()">📅 กำหนดการ</button>
      <button class="schedule-badge" onclick="openHelpModal()">💡 วิธีใช้</button>
    </div>
  </div>

  <!-- Announcement Banner -->
  <div id="announcementBanner" class="announcement-banner hidden"></div>

  <!-- My Status Card (shown when subscribed) -->
  <div class="my-card" id="myCard" style="display:none"></div>

  <div class="links-container" id="linksContainer">
    <div class="loading">กำลังโหลดข้อมูลการแข่งขัน...</div>
  </div>

  <!-- Toast Container -->
  <div class="toast-wrap" id="toastWrap"></div>

  <!-- Subscribe FAB -->
  <button class="sub-fab" id="subFab" onclick="openSubModal()" title="ติดตามผลของฉัน">🔔<span class="fab-badge" id="fabBadge" style="display:none"></span></button>

  <div class="footer">
    <p>Powered by <a href="#">TESUJI</a></p>
  </div>

  <!-- Modal -->
  <div class="modal-overlay" id="modalOverlay" onclick="closeModal(event)">
    <div class="modal-content" onclick="event.stopPropagation()">
      <div class="modal-handle"></div>
      <div class="modal-header">
        <h2 id="modalTitle" class="modal-title"></h2>
        <button class="modal-close" onclick="closeModal()">✕</button>
      </div>
      <div class="round-selector" id="roundSelector"></div>
      <div class="table-container">
        <table>
          <thead id="modalThead">
            <tr>
              <th class="td-center">โต๊ะ</th>
              <th>ชื่อ</th>
              <th class="td-center">ผล</th>
              <th class="td-right">ชื่อ</th>
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
        <button class="sub-back" id="subBackBtn" onclick="subGoBack()" style="display:none" title="ย้อนกลับ">←</button>
        <div class="sub-title" id="subTitle">ติดตามผลของฉัน 🔔</div>
        <button class="sub-close" onclick="closeSubModal()">✕</button>
      </div>
      <input class="sub-search" id="subSearch" placeholder="ค้นหาชื่อ..." oninput="filterSubList()" style="display:none">
      <div class="sub-step-label" id="subStepLabel">เลือกสาย</div>
      <div class="sub-list" id="subList"></div>
    </div>
  </div>

  <!-- History Modal -->
  <div class="hist-overlay" id="histOverlay" onclick="closeHistModal(event)">
    <div class="hist-sheet" onclick="event.stopPropagation()">
      <div class="hist-handle"></div>
      <div class="hist-header">
        <div class="hist-title" id="histTitle">ผลงาน</div>
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
        <div class="help-title">วิธีใช้งาน</div>
        <button class="help-close" onclick="closeHelpModal()">✕</button>
      </div>
      <div class="help-body">
        <div class="help-section">
          <div class="help-icon">📊</div>
          <div class="help-text">
            <div class="help-heading">ดูผลการแข่งขัน</div>
            <div class="help-desc">กดที่ชื่อรุ่นเพื่อดูผลแต่ละรอบ สามารถเลือกรอบได้จากปุ่มด้านบน ผลจะอัพเดทแบบ real-time อัตโนมัติ</div>
          </div>
        </div>
        <div class="help-section">
          <div class="help-icon">🔔</div>
          <div class="help-text">
            <div class="help-heading">ติดตามผลของฉัน</div>
            <div class="help-desc">กดปุ่ม 🔔 มุมขวาล่าง → เลือกสาย → เลือกชื่อ ระบบจะแสดงการ์ดผลการแข่งของคุณด้านบน พร้อมแจ้งเตือนเมื่อผลเปลี่ยน</div>
          </div>
        </div>
        <div class="help-section">
          <div class="help-icon">📅</div>
          <div class="help-text">
            <div class="help-heading">กำหนดการแข่งขัน</div>
            <div class="help-desc">กดปุ่ม "📅 กำหนดการ" ด้านบน จะเห็นตารางเวลาทุกรุ่น พร้อมสถานะ กำลังแข่ง / เสร็จแล้ว / ถัดไป</div>
          </div>
        </div>
        <div class="help-section">
          <div class="help-icon">📜</div>
          <div class="help-text">
            <div class="help-heading">ดูประวัติผลงาน</div>
            <div class="help-desc">เมื่อกดติดตามแล้ว จะมีปุ่ม "ดูผลงานทุกรอบ" ในการ์ด กดเพื่อดูผลแต่ละรอบย้อนหลังทั้งหมด</div>
          </div>
        </div>
        <button class="help-dismiss" onclick="closeHelpModal()">เข้าใจแล้ว!</button>
      </div>
    </div>
  </div>

  <!-- Schedule Modal -->
  <div class="modal-overlay" id="scheduleOverlay" onclick="closeScheduleModal(event)">
    <div class="modal-content" onclick="event.stopPropagation()" style="max-height:92vh">
      <div class="modal-handle"></div>
      <div class="modal-header">
        <h2 class="modal-title">📅 กำหนดการแข่งขัน</h2>
        <button class="modal-close" onclick="closeScheduleModal()">✕</button>
      </div>
      <div class="table-container" style="padding:14px 16px 28px">
        <div id="scheduleContainer"></div>
      </div>
    </div>
  </div>

  <script src="/live-assets/common.js"></script>
  <script src="/live-assets/results.js"></script>
</body>
</html>
`;

export async function GET() {
  return new Response(HTML, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
