import type { RulesSection, TournamentInput } from "@/lib/data/types";

/** Sample กฎ กติกา sections for the "ใส่ข้อมูลตัวอย่าง" button — shows
 *  off the block editor's block types (list, table, callout, divider). */
function sampleRulesSections(): RulesSection[] {
  return [
    {
      title: "กติกาการแข่งขัน",
      blocks: [
        {
          type: "list",
          ordered: true,
          items: [
            { text: "ใช้กติกาสากล โคมิ 6.5 แต้ม", depth: 0 },
            { text: "เวลาแข่งขันฝ่ายละ 30 นาที", depth: 0 },
            { text: "หมดเวลาปรับแพ้ทันที", depth: 1 },
            { text: "จับคู่ระบบ MacMahon 5 รอบ", depth: 0 },
          ],
        },
        { type: "divider" },
        { type: "heading", text: "ขนาดกระดานแต่ละรุ่น" },
        {
          type: "table",
          hasHeader: true,
          rows: [
            ["รุ่น", "กระดาน", "หักคะแนนต่อ"],
            ["เปิด", "19x19", "6.5"],
            ["เยาวชน", "13x13", "-"],
          ],
        },
      ],
    },
    {
      title: "ข้อปฏิบัติของผู้เข้าแข่งขัน",
      blocks: [
        {
          type: "list",
          ordered: true,
          items: [
            { text: "รายงานตัวก่อนเวลาแข่งขัน 30 นาที", depth: 0 },
            { text: "ปิดเสียงโทรศัพท์ระหว่างการแข่งขัน", depth: 0 },
          ],
        },
        {
          type: "callout",
          tone: "warn",
          text: "มาสายเกิน 15 นาทีถือว่าสละสิทธิ์",
        },
      ],
    },
  ];
}

export function sampleTournamentInput(): TournamentInput {
  const now = Date.now();
  const opens = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();
  const closes = new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString();
  return {
    nameTh: "การแข่งขันหมากล้อมชิงแชมป์ประเทศไทย ครั้งที่ 1",
    bannerUrl: null,
    competitionDate: "2025-09-14",
    locationText: "ศูนย์ประชุมแห่งชาติสิริกิติ์ ฮอลล์ 5 กรุงเทพฯ",
    locationMapsUrl: "https://maps.google.com/?q=ศูนย์ประชุมแห่งชาติสิริกิติ์",
    registrationOpensAt: opens,
    registrationClosesAt: closes,
    scheduleGroups: [],
    rulesSections: sampleRulesSections(),
    promptpayTargetType: "merchant_qr",
    promptpayTargetValue:
      "00020101021129370016A000000677010111011300668123456785802TH530376463045D82",
    status: "published",
  };
}
