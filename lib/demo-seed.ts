import type {
  Category,
  CategoryInput,
  DataLayer,
  RulesSection,
  ScheduleEntry,
  ScheduleGroup,
  TournamentInput,
} from "@/lib/data/types";
import { newScheduleId } from "@/lib/schedule";

/** Sample schedule — built once the categories have real ids. Shows a shared
 *  ตาราง (พิธีการรวมหลายรุ่น) plus a per-รุ่น match ตาราง. */
function sampleScheduleGroups(cats: Category[]): ScheduleGroup[] {
  const entry = (e: Omit<ScheduleEntry, "id">): ScheduleEntry => ({
    id: newScheduleId(),
    ...e,
  });
  const open = cats.find((c) => c.code === "A");
  const youth = cats.find((c) => c.code === "B");
  const groups: ScheduleGroup[] = [];
  const shared = [open?.id, youth?.id].filter(Boolean) as string[];
  if (shared.length) {
    groups.push({
      categoryIds: shared, // หลายรุ่นแข่ง/ทำกิจกรรมเวลาเดียวกัน
      entries: [
        entry({ time: "09:00", type: "opening", boardNumber: null, note: null }),
        entry({ time: "12:00–13:00", type: "lunch", boardNumber: null, note: null }),
        entry({ time: "16:30", type: "award", boardNumber: null, note: null }),
      ],
    });
  }
  if (open) {
    groups.push({
      categoryIds: [open.id],
      entries: [
        entry({ time: "09:30–12:00", type: "match", boardNumber: "1", note: "รอบที่ 1–2" }),
        entry({ time: "13:00–16:30", type: "match", boardNumber: "1", note: "รอบที่ 3–5" }),
      ],
    });
  }
  if (youth) {
    groups.push({
      categoryIds: [youth.id],
      entries: [
        entry({ time: "10:00–12:00", type: "match", boardNumber: "2", note: "รอบที่ 1–2" }),
      ],
    });
  }
  return groups;
}

/** Sample กฎ กติกา sections for the demo / "ใส่ข้อมูลตัวอย่าง" button — shows
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

export const sampleCategories: Omit<CategoryInput, "tournamentId">[] = [
  {
    code: "A",
    name: "รุ่นบุคคลทั่วไป (Open)",
    capacity: 16,
    feeThb: 300,
    minPowerLevel: 17, // 1 ดั้ง ขึ้นไป
    maxPowerLevel: null,
    sortOrder: 0,
  },
  {
    code: "B",
    name: "รุ่นเยาวชนอายุไม่เกิน 12 ปี",
    capacity: 8,
    feeThb: 200,
    minPowerLevel: 7, // 10 คิว
    maxPowerLevel: 16, // 1 คิว
    maxAge: 12, // อายุไม่เกิน 12 ปี
    sortOrder: 1,
  },
  {
    code: "C",
    name: "รุ่นมือใหม่",
    capacity: 2,
    feeThb: 150,
    minPowerLevel: null, // รวมกระดานเล็ก 9×9/13×13
    maxPowerLevel: 6, // ไม่เกิน 11 คิว
    sortOrder: 2,
  },
  {
    code: "D",
    name: "รุ่นอาวุโส (50 ปีขึ้นไป)",
    capacity: 12,
    feeThb: 250,
    minAge: 50, // อายุ 50 ปีขึ้นไป
    sortOrder: 3,
  },
];

export async function seedDemo(dl: DataLayer): Promise<string> {
  const t = await dl.upsertTournament(sampleTournamentInput());
  const cats: Category[] = [];
  for (const c of sampleCategories) {
    cats.push(await dl.upsertCategory({ ...c, tournamentId: t.id }));
  }
  // Now that categories have real ids, attach the per-รุ่น sample schedule.
  await dl.upsertTournament({
    ...sampleTournamentInput(),
    id: t.id,
    scheduleGroups: sampleScheduleGroups(cats),
  });
  return t.id;
}
