# ฐานข้อมูลระดับฝีมือ (Rank Databases) — DAN / KYU / AWARD

เอกสารนี้อธิบายรูปแบบไฟล์ **Excel (.xlsx)** ทั้ง 3 แบบที่แอดมินอัปโหลดได้จากหน้า
`/admin/database` เพื่อใช้ **ยืนยันระดับฝีมือ (rank)** ของผู้สมัครโดยจับคู่จากชื่อ-นามสกุล

- Parser อยู่ที่ [`lib/go-database.ts`](../lib/go-database.ts) (อ่านด้วย SheetJS `xlsx`)
- การอัปโหลดแต่ละฐาน **แทนที่ข้อมูลเดิมของฐานนั้นทั้งหมด** (delete-then-insert ผ่าน RPC `replace_go_player_database_source`)
- ระบบอ่าน **ชีตแรก** ของไฟล์ และใช้ **แถวแรกเป็นหัวคอลัมน์** — ชื่อหัวคอลัมน์ต้องเป็น **ตัวพิมพ์เล็ก** ตามด้านล่าง (ระบบ trim + lowercase ให้ แต่สะกดต้องตรง)

> ระดับฝีมือเก็บเป็นจำนวนเต็ม `power_level` (สูง = เก่งกว่า): 9×9=0, 13×13=1, 15 kyu..1 kyu = 2..16, 1 dan..9 dan = 17..25 (kyu สูงสุด 15) — ดู [`lib/rank.ts`](../lib/rank.ts)

---

## 1) ฐาน DAN

**คอลัมน์ที่ต้องมี:** `firstname`, `lastname`, `rank`
**คอลัมน์ทั้งหมด:** `seq`, `prefix`, `firstname`, `lastname`, `year`, `rank`, `diamond`, `gat`

| คอลัมน์ | ความหมาย | แมปไปเป็น |
|---|---|---|
| `seq` | ลำดับ | `seq` |
| `prefix` | คำนำหน้า | `prefix_th` |
| `firstname` / `lastname` | ชื่อ / นามสกุล (ไทย) | ต้องมีค่า ไม่งั้นข้ามแถว |
| `year` | ปีที่สอบผ่าน | `year_promoted` |
| `rank` | **ระดับดั้ง 1–9** (ตัวเลข) | `power_level = 16 + rank` |
| `diamond` | ข้อมูล diamond | `diamond` |
| `gat` | คะแนน rating | `rating` |

`rank` ต้องเป็นจำนวนเต็ม 1–9 มิฉะนั้นข้ามแถว (เช่น 3 → "3 Dan", power 19)

**ตัวอย่าง**

| seq | prefix | firstname | lastname | year | rank | diamond | gat |
|---|---|---|---|---|---|---|---|
| 1 | นาย | สมชาย | ทองดี | 2018 | 3 | มี | 2200 |
| 2 | น.ส. | สมหญิง | รักเรียน | 2010 | 9 | | 2800 |

→ "สมชาย ทองดี" = 3 Dan (power 19), "สมหญิง รักเรียน" = 9 Dan (power 25)

---

## 2) ฐาน KYU

**คอลัมน์ที่ต้องมี:** `firstname`, `lastname`, `rank`
**คอลัมน์ทั้งหมด:** `seq`, `prefix`, `firstname`, `lastname`, `rank`, `date`

| คอลัมน์ | ความหมาย | แมปไปเป็น |
|---|---|---|
| `rank` | **ระดับคิว (kyu)** (ตัวเลข) | `power_level = 17 − min(kyu, 15)` |
| `date` | วันที่ได้ระดับ | `event_date` (แปลงเป็น ISO) |

- kyu ถูก **cap ที่ 15** (เช่น 20 → ใช้ 15 → power 2; 5 → power 12)
- ถ้ามีชื่อ-นามสกุล (หลัง normalize) **ซ้ำกัน** จะเก็บแถวที่ **เก่งกว่า** (power สูงกว่า)

**ตัวอย่าง**

| seq | firstname | lastname | rank | date |
|---|---|---|---|---|
| 1 | วิชัย | มั่นคง | 5 | 2022-05-15 |
| 2 | มานะ | อดทน | 20 | 2021-01-10 |

→ "วิชัย มั่นคง" = 5 Kyu (power 12), "มานะ อดทน" = 15 Kyu (cap, power 2)

---

## 3) ฐาน AWARD (ผู้ได้รับรางวัล)

**คอลัมน์ที่ต้องมี:** `firstname`, `lastname`, `rank_in_category`, `rank_award`
**คอลัมน์ทั้งหมด:** `seq`, `prefix`, `firstname`, `lastname`, `phone`, `category`, `rank_in_category`, `rank_award`, `event_name`, `date`, `organizer`

| คอลัมน์ | ความหมาย | แมปไปเป็น |
|---|---|---|
| `rank_award` | อันดับรางวัล — **เก็บเฉพาะ 1, 2, 3** | `rank_award` (อื่น ๆ ข้ามแถว) |
| `rank_in_category` | รุ่น/ระดับที่ได้รางวัล | ใช้คำนวณ kyu (ดูกฎ) |
| `category` | ชื่อรุ่น | `category` |
| `event_name` / `date` | ชื่อ/วันที่งาน | `event_name` / `event_date` |
| `phone`, `organizer` | เบอร์, ผู้จัด | เก็บใน `raw_data` |

**กฎแปลง `rank_in_category` → kyu** (โดย `ease(k) = min(15, max(1, k − 1))`):

| รูปแบบ `rank_in_category` | ผลลัพธ์ |
|---|---|
| `9x9` หรือ `13x13` | 12 Kyu (power 5) |
| ช่วง เช่น `5-8 Kyu` | `ease(min(5,8)) = ease(5) = 4 Kyu` (power 13) |
| เดี่ยว เช่น `3 Kyu` | `ease(3) = 2 Kyu` (power 15) |

ถ้าแปลงไม่ได้ (เช่น `1 Dan`) จะข้ามแถว · kyu สุดท้าย cap ที่ 15 เสมอ

**ตัวอย่าง**

| firstname | lastname | rank_in_category | rank_award | category | event_name | date |
|---|---|---|---|---|---|---|
| ดาว | ประกาย | 9x9 | 1 | ประถม | ชิงแชมป์ | 2022-05-15 |
| เดือน | เพ็ญ | 5-8 Kyu | 2 | | | |

→ "ดาว ประกาย" = 12 Kyu (power 5), "เดือน เพ็ญ" = 4 Kyu (power 13)

---

## การจับคู่ชื่อ (Name matching)

ตอนผู้สมัครยืนยันระดับฝีมือ ระบบจะค้นจากทั้ง 3 ฐาน (Dan มาก่อน, ไม่งั้นเอา kyu/award
ที่เก่งสุดต่อชื่อ) ผ่าน RPC `search_go_player_database` โดยเทียบ 3 ชั้น:

1. **exact** — ชื่อ-นามสกุลตรงเป๊ะ
2. **normalized** — ตรงหลัง **normalize ชื่อไทย**
3. **fuzzy** — ความคล้าย (`pg_trgm` similarity > 0.4)

**กฎ normalize ชื่อไทย** (ต้องตรงกันทั้งฝั่ง SQL `normalize_thai_name` และ TS
`normalizeThaiName`): `ศ,ษ → ส` · `ณ → น` · `ญ → ย` · `ภ → พ` · `ฎ → ด` · `ฏ → ต` ·
`ฑ → ท` · `ใ → ไ` · ตัด `์` · ยุบช่องว่างซ้ำให้เหลือช่องเดียว

ผลการค้น:
- **พบรายเดียว (matched)** → ยืนยันอัตโนมัติ (`rankStatus = verified`)
- **พบหลายราย (multiple)** → ให้ผู้สมัครเลือกเอง (พร้อมหลักฐาน เช่น ปีที่สอบผ่าน/เรตติ้ง)
- **ไม่พบ (not_found)** → ระบุระดับเอง → `rankStatus = pending` รอแอดมินอนุมัติที่ `/admin/ranks`
