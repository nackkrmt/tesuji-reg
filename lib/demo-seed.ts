import type { CategoryInput, DataLayer, TournamentInput } from "@/lib/data/types";

export function sampleTournamentInput(): TournamentInput {
  const now = Date.now();
  const opens = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();
  const closes = new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString();
  return {
    nameTh: "การแข่งขันหมากล้อมชิงแชมป์ประเทศไทย ครั้งที่ 1",
    bannerUrl: null,
    competitionDate: "14–15 กันยายน 2568",
    locationText: "ศูนย์ประชุมแห่งชาติสิริกิติ์ ฮอลล์ 5 กรุงเทพฯ",
    locationMapsUrl: "https://maps.google.com/?q=ศูนย์ประชุมแห่งชาติสิริกิติ์",
    registrationOpensAt: opens,
    registrationClosesAt: closes,
    scheduleText:
      "08:00 – 08:45  ลงทะเบียนหน้างาน\n09:00 – 09:30  พิธีเปิด\n09:30 – 12:00  การแข่งขันรอบที่ 1–2\n13:00 – 16:30  การแข่งขันรอบที่ 3–5\n16:30 – 17:00  ประกาศผลและมอบรางวัล",
    rulesText:
      "1. ใช้กติกาสากล (Japanese Rule) คอมมิ 6.5 แต้ม\n2. เวลาคิดฝ่ายละ 30 นาที + byo-yomi 30 วินาที 3 ครั้ง\n3. ระบบการแข่งขันแบบสวิส 5 รอบ\n4. ผู้เข้าแข่งขันต้องมาถึงสถานที่ก่อนเวลาแข่งอย่างน้อย 15 นาที\n5. การตัดสินของกรรมการถือเป็นที่สิ้นสุด",
    promptpayTargetType: "phone",
    promptpayTargetValue: "0812345678",
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
  for (const c of sampleCategories) {
    await dl.upsertCategory({ ...c, tournamentId: t.id });
  }
  return t.id;
}
