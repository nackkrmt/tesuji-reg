# ฐานข้อมูลระดับฝีมือ (Rank Databases) — DAN / KYU / AWARD

เอกสารนี้อธิบายรูปแบบไฟล์ **Excel (.xlsx)** ทั้ง 3 แบบที่แอดมินอัปโหลดได้จากหน้า
`/admin/database` เพื่อใช้ **ยืนยันระดับฝีมือ (rank)** ของผู้สมัครโดยจับคู่จากชื่อ-นามสกุล

นำเข้าได้ **2 ทาง** จากหน้า `/admin/database` (ทั้งคู่ใช้ parser + กฎเดียวกันเป๊ะ):

1. **Sync จาก Google Sheets** — วางลิงก์ชีต (แชร์แบบ *public / publish to web*) แล้วกด **Sync** ระบบดึง CSV ล่าสุดมาเอง ผ่าน Edge Function [`sync-go-database`](../supabase/functions/sync-go-database/index.ts) (ดึงฝั่ง server เพื่อเลี่ยง CORS) · ลิงก์ของแต่ละฐานถูกเก็บใน `app_config` (`gsheet_dan_url` / `gsheet_kyu_url` / `gsheet_award_url`)
2. **อัปโหลดไฟล์ Excel (.xlsx)** — แบบเดิม (fallback)

- Parser อยู่ที่ [`lib/go-database.ts`](../lib/go-database.ts) (อ่านด้วย SheetJS `xlsx`) — `parseGoDatabaseExcel()` (ไฟล์) และ `parseGoDatabaseCsv()` (Google Sheets) ใช้ตรรกะ mapping ร่วมกัน
- การนำเข้าแต่ละฐาน **แทนที่ข้อมูลเดิมของฐานนั้นทั้งหมด** (delete-then-insert ผ่าน RPC `replace_go_player_database_source`)
- ระบบอ่าน **ชีตแรก** และใช้ **แถวแรกเป็นหัวคอลัมน์** — ชื่อหัวคอลัมน์ต้องเป็น **ตัวพิมพ์เล็ก** ตามด้านล่าง (ระบบ trim + lowercase ให้ แต่สะกดต้องตรง)

> ระดับฝีมือเก็บเป็นจำนวนเต็ม `power_level` (สูง = เก่งกว่า): 15 kyu..1 kyu = 0..14, 1 dan..8 dan = 15..22 (kyu สูงสุด 15 และไม่ข้ามไปดั้ง) — ดู [`lib/rank.ts`](../lib/rank.ts)

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
| `rank` | **ระดับดั้ง 1–8** (ตัวเลข) | `power_level = 14 + min(rank, 8)` |
| `diamond` | ข้อมูล diamond | `diamond` |
| `gat` | คะแนน rating | `rating` |

`rank` ต้องเป็นจำนวนเต็ม ≥ 1 (เกิน 8 ถูก cap เป็น 8 ดั้ง) มิฉะนั้นข้ามแถว (เช่น 3 → "3 Dan", power 17)

**ตัวอย่าง**

| seq | prefix | firstname | lastname | year | rank | diamond | gat |
|---|---|---|---|---|---|---|---|
| 1 | นาย | สมชาย | ทองดี | 2018 | 3 | มี | 2200 |
| 2 | น.ส. | สมหญิง | รักเรียน | 2010 | 9 | | 2800 |

→ "สมชาย ทองดี" = 3 Dan (power 17), "สมหญิง รักเรียน" = 8 Dan (cap, power 22)

---

## 2) ฐาน KYU

**คอลัมน์ที่ต้องมี:** `firstname`, `lastname`, `rank`
**คอลัมน์ทั้งหมด:** `seq`, `prefix`, `firstname`, `lastname`, `rank`, `date`

| คอลัมน์ | ความหมาย | แมปไปเป็น |
|---|---|---|
| `rank` | **ระดับคิว (kyu)** (ตัวเลข) | `power_level = 15 − min(kyu, 15)` |
| `date` | วันที่ได้ระดับ | `event_date` (แปลงเป็น ISO) |

- kyu ถูก **cap ที่ 15** (เช่น 20 → ใช้ 15 → power 0; 5 → power 10)
- ถ้ามีชื่อ-นามสกุล (หลัง normalize) **ซ้ำกัน** จะเก็บแถวที่ **เก่งกว่า** (power สูงกว่า)

**ตัวอย่าง**

| seq | firstname | lastname | rank | date |
|---|---|---|---|---|
| 1 | วิชัย | มั่นคง | 5 | 2022-05-15 |
| 2 | มานะ | อดทน | 20 | 2021-01-10 |

→ "วิชัย มั่นคง" = 5 Kyu (power 10), "มานะ อดทน" = 15 Kyu (cap, power 0)

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
| `9x9` | 14 Kyu (power 1) |
| `13x13` | 13 Kyu (power 2) |
| ช่วง เช่น `5-8 Kyu` | `ease(min(5,8)) = ease(5) = 4 Kyu` (power 11) |
| เดี่ยว เช่น `3 Kyu` | `ease(3) = 2 Kyu` (power 13) |

ถ้าแปลงไม่ได้ (เช่น `1 Dan`) จะข้ามแถว · kyu สุดท้าย cap ที่ 15 เสมอ (รางวัลไม่ข้ามไปดั้ง)

**ตัวอย่าง**

| firstname | lastname | rank_in_category | rank_award | category | event_name | date |
|---|---|---|---|---|---|---|
| ดาว | ประกาย | 9x9 | 1 | ประถม | ชิงแชมป์ | 2022-05-15 |
| เดือน | เพ็ญ | 5-8 Kyu | 2 | | | |

→ "ดาว ประกาย" = 14 Kyu (power 1), "เดือน เพ็ญ" = 4 Kyu (power 11)

---

## การจับคู่ชื่อ (Name matching)

ตอนผู้สมัครยืนยันระดับฝีมือ ระบบจะค้น**ทั้ง 3 ฐานพร้อมกันเสมอ** ผ่าน RPC
`search_go_player_database` โดยเทียบ 3 ชั้น:

1. **exact** — ชื่อ-นามสกุลตรงเป๊ะ
2. **normalized** — ตรงหลัง **normalize ชื่อไทย**
3. **fuzzy** — ความคล้าย (`pg_trgm` similarity > 0.4 บนชื่อเต็มต่อกัน — ระวัง:
   นามสกุลยาวที่เหมือนกันอาจดันคนละคนข้ามเกณฑ์ได้)

**กฎ normalize ชื่อไทย** (ต้องตรงกันทั้งฝั่ง SQL `normalize_thai_name` และ TS
`normalizeThaiName`): `ศ,ษ → ส` · `ณ → น` · `ญ → ย` · `ภ → พ` · `ฎ → ด` · `ฏ → ต` ·
`ฑ → ท` · `ใ → ไ` · ตัด `์` · ยุบช่องว่างซ้ำให้เหลือช่องเดียว

การรวมผล (ฝั่ง client, `searchRank`):
- ฐาน Dan ชนะขาด**เฉพาะเมื่อ** match เป็น exact/normalized (นักดั้งตัวจริง —
  ระดับดั้งปัจจุบันทับประวัติ kyu/award เก่า)
- ไม่งั้น merge ทุกฐาน, ยุบเหลือรายที่เก่งสุดต่อชื่อ แล้วเรียงตาม
  **คุณภาพ match (exact → normalized → fuzzy) > ความคล้าย > power** —
  fuzzy ในฐานดั้งจะไม่บัง match ที่แม่นกว่าในฐาน kyu/award อีกต่อไป

ผลการค้น:
- **เจอ exact/normalized ชัวร์ตัวเดียว (matched)** → ใช้ระดับจากฐานข้อมูลทันที
  (`rankStatus = verified`) พร้อมแสดงชื่อคนที่จับคู่ใน badge — **ต่อให้มีชื่อคล้าย
  (fuzzy) โผล่มาด้วยก็ยัง auto** เพราะชื่อที่ตรงเป๊ะไม่กำกวม
- **มีแต่ fuzzy หรือมี exact ซ้ำหลายคน (multiple)** → ให้ผู้สมัครกดยืนยันเอง
  (พร้อมหลักฐาน เช่น ปีที่สอบผ่าน/เรตติ้ง) — fuzzy ล้วนแม้รายเดียวก็**ไม่** auto-apply
- **ไม่พบ (not_found)** → กำหนดเป็น **15 คิว (power 0)** อัตโนมัติ ไม่มีการกรอกเอง/รออนุมัติ
