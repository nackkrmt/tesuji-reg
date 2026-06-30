# 碁 TesujiReg

> ระบบรับสมัครแข่งขันกีฬาหมากล้อม (Go / 囲碁 / Weiqi) — มือถือมาก่อน, ภาษาไทย
> _A mobile-first registration system for Go tournaments._

[![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20Auth-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-38BDF8?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

TesujiReg ช่วยให้ผู้จัดการแข่งขันหมากล้อมเปิดรับสมัครออนไลน์ได้ครบวงจร — ผู้เล่นสมัครเอง / โค้ช-ผู้ปกครองสมัครให้ลูกทีม, เลือกรุ่นตามระดับฝีมือ (พร้อมระบบกันโกงรุ่น), จ่ายเงินผ่าน QR ร้านค้า (K SHOP / Thai-QR) แล้วอัปสลิป (ตรวจอัตโนมัติด้วย SlipOK), และแอดมินตรวจ-ยืนยันใบสมัครได้จากหลังบ้าน

---

## สารบัญ / Table of Contents

- [ฟีเจอร์ (Features)](#ฟีเจอร์-features)
- [Tech Stack](#tech-stack)
- [เริ่มต้นใช้งาน (Getting Started)](#เริ่มต้นใช้งาน-getting-started)
- [โครงสร้างโปรเจกต์ (Project Structure)](#โครงสร้างโปรเจกต์-project-structure)
- [สถาปัตยกรรม (Architecture)](#สถาปัตยกรรม-architecture)
- [Backend (Supabase)](#backend-supabase)
- [เอกสารเพิ่มเติม (Documentation)](#เอกสารเพิ่มเติม-documentation)
- [License](#license)

---

## ฟีเจอร์ (Features)

**ฝั่งผู้ใช้ (Public / Player)**
- 🏠 **หน้าแรก** — ข้อมูลรายการแข่ง, รุ่น/ค่าสมัคร, ที่นั่งคงเหลือแบบเรียลไทม์, กำหนดการ, กติกา
- 👤 **บัญชีผู้ใช้** — สมัครสมาชิก/เข้าสู่ระบบด้วยอีเมล+รหัสผ่าน (Supabase Auth) พร้อม **รีเซ็ตรหัสผ่านทางอีเมล** (ลืมรหัสผ่าน) และปุ่มแสดง/ซ่อนรหัสผ่าน; กรอกโปรไฟล์ครั้งเดียว ครั้งต่อไปเติมให้อัตโนมัติ
- 👨‍👩‍👧 **ผู้เล่นในความดูแล (managed players)** — โค้ช/ผู้ปกครองบันทึกรายชื่อลูกทีมไว้ใช้สมัครซ้ำได้ (ชื่ออังกฤษไม่บังคับ เติมภายหลังได้); ช่อง **เบอร์โทร/จังหวัด/สถาบัน** มีตัวเลือก **"เหมือนเจ้าของบัญชี"** เติมให้อัตโนมัติ; ผู้เล่นที่มีใบสมัครที่ยัง active อยู่จะ **ลบไม่ได้** (กันลบทิ้งทั้งที่สมัครแข่งค้างอยู่)
- 🗺️ **จังหวัด / สถาบันหมากล้อม / PDPA** — เลือกจังหวัดที่อาศัย (dropdown ค้นหาได้ 77 จังหวัด), เลือกสถาบันจากฐานข้อมูล **หรือพิมพ์เพิ่มใหม่ได้** (ฐานโตเอง), และติ๊กยินยอม PDPA — ข้อมูลถูก snapshot ติดไปกับใบสมัครแต่ละงานด้วย
- 📝 **สมัครแข่ง (ต้องล็อกอินก่อน)** — เลือกผู้เข้าแข่งขัน → เลือกรุ่นให้แต่ละคน → สรุป → จ่ายเงิน
- ➕ **สมัครได้หลายรุ่นต่อคน** — แอดมินกำหนด "รุ่นที่เล่นควบกันได้" (เช่น 9×9 + 13×13 ที่แข่งคนละเวลา); เลือกควบได้เฉพาะคู่ที่อนุญาต บังคับจากฝั่งเซิร์ฟเวอร์
- 🎟️ **จองที่นั่ง 15 นาที** — ตัดโควตาแบบ all-or-nothing พร้อมตัวนับถอยหลัง, หมดเวลาแล้วคืนที่นั่งอัตโนมัติ
- 🔁 **ทนทานช่วงคนแห่สมัคร** — การโหลดหน้าจอ **auto-retry** อัตโนมัติเมื่อระบบแน่นชั่วคราว (exponential backoff + jitter กันคลื่นลูกสอง); การจอง/ส่งใบสมัครเป็น manual-retry ที่กันการจองซ้ำ (เคลียร์ hold ค้างก่อนจองใหม่)
- 💳 **QR ร้านค้า (K SHOP / Thai-QR) + อัปสลิป** — สร้าง QR ล็อกยอดจาก merchant QR ของร้านโดยตรง (เงินยังเข้าร้านใน K SHOP เหมือนเดิม) แล้วอัปโหลดสลิป — ระบบ **ตรวจสลิปอัตโนมัติทันทีที่ส่ง** (SlipOK)
- 🚫 **กันสมัครซ้ำรุ่นเดิม** — คนเดียวสมัครรุ่นเดียวกันซ้ำไม่ได้ (เช็คฝั่งเซิร์ฟเวอร์ ข้ามใบสมัคร)
- 🏅 **ระดับฝีมือ (Go rank) + จำกัดอายุ + กันโกงรุ่น** — ตรวจสิทธิ์เข้ารุ่นตามช่วงระดับฝีมือ **และช่วงอายุ** บังคับจากฝั่งเซิร์ฟเวอร์
- ✅ **ยืนยันระดับฝีมือจาก 3 ฐานข้อมูล** — DAN / KYU / AWARD จับคู่ด้วยชื่อ (ค้น Dan ก่อน แล้ว Kyu/Award); **ไม่พบ → กำหนดเป็น 15 คิวอัตโนมัติ** (ไม่ต้องกรอกเอง/รออนุมัติ)
- 📱 **ติดตั้งเป็นแอปได้ (PWA)** — รองรับ Add to Home Screen ทั้ง iOS/Android เปิดแบบเต็มจอ (standalone) พร้อมไอคอนแบรนด์

**ฝั่งแอดมิน (Admin — ป้องกันด้วย passphrase)**
- ⚙️ ตั้งค่ารายการแข่ง (ชื่อ, แบนเนอร์, วันเวลาเปิด-ปิดรับ, ผู้รับเงิน — QR ร้านค้า K SHOP / Thai-QR, กำหนดการ, กติกา)
- 📅 **ตัวสร้างกำหนดการแบบมีโครงสร้าง** — จัดกลุ่มตามรุ่น (รุ่นที่แข่งเวลาเดียวกันรวมตารางเดียวได้) แล้วเพิ่มรายการทีละช่วงเวลาพร้อมประเภท (แข่งขัน/พิธีเปิด/พักเที่ยง/พิธีปิด/มอบรางวัล/จับฉลาก) + กระดานที่/หมายเหตุ
- 📄 **กติกาเป็นไฟล์ PDF** — อัปโหลด PDF ให้ผู้เล่นเปิด/ดาวน์โหลด (แทนการพิมพ์ข้อความยาว)
- 🗂️ จัดการรุ่น/หมวด (โควตา, ค่าสมัคร, ช่วงระดับฝีมือ min/max, **ช่วงอายุ min/max**, **รุ่นที่เล่นควบกันได้**)
- 📋 ตรวจ-ยืนยัน/ปฏิเสธใบสมัคร + ดูสลิป — **ค้นหารายชื่อ** (แสดงเป็นรายคน + ยอดที่ต้องโอน + จังหวัด/สถาบัน/สถานะ PDPA), **แก้ไข/ลบผู้สมัครรายคนหรือทั้งใบ** (ปรับที่นั่ง/ยอดเงินให้อัตโนมัติ), หน้ารวมรายชื่อผู้เข้าแข่งขัน
- 🤖 **ตรวจสลิปอัตโนมัติ (SlipOK)** — ตรวจ **อัตโนมัติทันทีที่ผู้ใช้ส่งสลิป** (และแอดมินกดตรวจซ้ำได้): เทียบยอด, **เช็กบัญชีผู้รับ** (เตือน `receiver_mismatch` เมื่อโอนผิดบัญชี — ฟันธงได้กับ PromptPay เบอร์/บัตร, ส่วน merchant QR อาศัย branch-binding ของ SlipOK + ให้แอดมินดูประกอบ), ตรวจสลิปซ้ำ — ผ่าน Edge Function (คีย์อยู่ฝั่งเซิร์ฟเวอร์); ยังไม่ตั้งคีย์ → ทำงานแบบ **เดโม (ผลจำลอง)** ได้ทันที
- 🏫 **จัดการฐานข้อมูลสถาบันหมากล้อม** — เพิ่ม/แก้ชื่อ/ปิดใช้งานสถาบัน (สถาบันที่ผู้สมัครพิมพ์เพิ่มเองจะมาแสดงที่นี่)
- 🔄 นำเข้าฐานข้อมูลระดับฝีมือ (DAN/KYU/AWARD) — **Sync จาก Google Sheets** (วางลิงก์ public แล้วกดดึงล่าสุด) หรืออัปโหลดไฟล์ Excel (.xlsx) เป็น fallback

**Routes**

| Path | คำอธิบาย |
|---|---|
| `/` | หน้าแรก + ข้อมูลรายการแข่ง |
| `/schedule`, `/rules` | กำหนดการ / กติกา |
| `/login`, `/signup` | เข้าสู่ระบบ / สมัครสมาชิก |
| `/forgot-password`, `/reset-password` | ขอลิงก์รีเซ็ตรหัสผ่าน / ตั้งรหัสผ่านใหม่ |
| `/profile`, `/account` | โปรไฟล์ตัวเอง / ผู้เล่นในความดูแล |
| `/register` → `/register/applicant` → `/register/categories` → `/register/payment` → `/register/success` | ขั้นตอนสมัครแข่ง (+ `/register/expired` เมื่อหมดเวลาจอง) |
| `/participants` | รายชื่อผู้เข้าแข่งขัน (สาธารณะ) — แสดงสถานะ ยืนยันแล้ว / รอตรวจสลิป |
| `/admin/*` | หลังบ้าน: `login`, `tournament`, `categories`, `registrations`, `registrations/[id]`, `database`, `institutes` |

---

## Tech Stack

| เทคโนโลยี | เวอร์ชัน | บทบาท |
|---|---|---|
| [Next.js](https://nextjs.org/) (App Router) | ^14.2 | เฟรมเวิร์ก React + routing + SSR |
| [React](https://react.dev/) | 18.3 | UI |
| [TypeScript](https://www.typescriptlang.org/) | ^5.6 | Type safety |
| [Tailwind CSS](https://tailwindcss.com/) | ^3.4 | Styling (mobile-first) |
| [Supabase JS](https://supabase.com/) | ^2.108 | Postgres + Auth + Storage + RPC |
| [react-hook-form](https://react-hook-form.com/) | ^7.53 | ฟอร์ม |
| [zod](https://zod.dev/) | ^3.23 | Validation schema |
| [qrcode.react](https://www.npmjs.com/package/qrcode.react) | ^4.1 | render Thai-QR (K SHOP merchant QR แบบฝังยอด) เป็นภาพ |
| [xlsx (SheetJS)](https://sheetjs.com/) | ^0.18 | อ่าน Excel/CSV ฐานข้อมูลระดับฝีมือ (รวม Google Sheets sync) |

---

## เริ่มต้นใช้งาน (Getting Started)

### Prerequisites
- **Node.js 18+** และ **npm**
- (สำหรับโหมด backend จริง) โปรเจกต์ **Supabase** ที่ลง schema + RPC ไว้แล้ว — หรือใช้ **โหมด mock** ที่ไม่ต้องมี backend เลย

### ติดตั้ง & รัน

```bash
npm install
cp .env.example .env.local   # แล้วแก้ค่าตามด้านล่าง
npm run dev                  # → http://localhost:3000
```

สคริปต์อื่น ๆ:

```bash
npm run build   # production build
npm run start   # รัน production build
npm run lint    # ESLint
```

### Environment variables

คัดลอกจาก [`.env.example`](./.env.example) ไปเป็น `.env.local` (ไฟล์นี้ถูก gitignore ไว้ — **อย่า commit ค่าจริง**):

| ตัวแปร | คำอธิบาย |
|---|---|
| `NEXT_PUBLIC_DATA_BACKEND` | `supabase` (backend จริง) หรือ `mock` (localStorage, ไม่ต้องมี backend) |
| `NEXT_PUBLIC_SUPABASE_URL` | URL ของโปรเจกต์ Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | publishable / anon key — **ปลอดภัยที่จะเปิดเผยในเบราว์เซอร์** ตามดีไซน์ (RLS คุมสิทธิ์) |
| `NEXT_PUBLIC_ADMIN_PASSPHRASE` | รหัสผ่านแอดมิน ต้องตรงกับ `app_config.admin_secret` ในฐานข้อมูล ⚠️ ดู _หมายเหตุความปลอดภัย_ |
| `NEXT_PUBLIC_DEFAULT_MERCHANT_QR` | (ออปชัน) Thai-QR ร้านค้าตั้งต้นสำหรับผู้จัดรายเดียว — วาง payload static (เช่น export จาก K SHOP, ขึ้นต้น `00020101…`) แล้วรายการแข่งใหม่จะใช้เป็นผู้รับเงินอัตโนมัติ; เว้นว่าง = แอดมินวาง Thai-QR ของร้านเองในฟอร์มตั้งค่ารายการแข่ง |

> 🔐 **คีย์ SlipOK ไม่ใช่ตัวแปร `NEXT_PUBLIC_`** — ตั้งเป็น **Edge Function secrets** (`SLIPOK_API_KEY`, `SLIPOK_BRANCH_ID`) ในฝั่งเซิร์ฟเวอร์เท่านั้น ดู _Supabase setup_ ด้านล่าง

> 🧪 **โหมดเดโมแบบไม่มี backend:** ตั้ง `NEXT_PUBLIC_DATA_BACKEND=mock` แล้วรัน `npm run dev` ได้เลย — ทุกอย่างทำงานบน `localStorage` ไม่ต้องตั้ง Supabase

### Supabase setup (สำหรับ backend จริง)
1. สร้างโปรเจกต์ Supabase แล้วลง schema + RPC (ตาราง/ฟังก์ชันตามที่อธิบายใน [ARCHITECTURE.md](./ARCHITECTURE.md))
2. ใส่ `NEXT_PUBLIC_SUPABASE_URL` และ `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` ใน `.env.local`
3. **ขั้นตอนต้องทำเองใน Dashboard (ตั้งผ่าน SQL ไม่ได้):** Authentication → Sign In / Providers → Email → ปิด **"Confirm email"** เพื่อให้สมัครแล้วล็อกอินได้ทันที (ถ้าเปิดไว้ แอปจะแสดงหน้า "ตรวจสอบอีเมล" ให้)
4. ตั้ง `NEXT_PUBLIC_ADMIN_PASSPHRASE` ให้ตรงกับ `app_config.admin_secret`
5. (ออปชัน) ฟีเจอร์ **Sync จาก Google Sheets** ในหน้า `/admin/database` ต้อง deploy Edge Function `sync-go-database` (โค้ดที่ [`supabase/functions/sync-go-database`](./supabase/functions/sync-go-database/index.ts)) — ดึง CSV ของชีต public ฝั่ง server เพื่อเลี่ยง CORS; ลิงก์ของแต่ละฐานถูกเก็บอัตโนมัติใน `app_config` (`gsheet_dan_url` / `gsheet_kyu_url` / `gsheet_award_url`) · ชีตต้องแชร์แบบ public / publish to web และหัวคอลัมน์ตรงตาม [docs/rank-databases.md](./docs/rank-databases.md)
6. (ออปชัน) ฟีเจอร์ **ตรวจสลิปอัตโนมัติ** ต้อง deploy Edge Function `verify-slip` (โค้ดที่ [`supabase/functions/verify-slip`](./supabase/functions/verify-slip/index.ts)) — เรียก SlipOK ฝั่ง server เพื่อไม่ให้คีย์หลุดไปเบราว์เซอร์ · ตั้ง secrets `SLIPOK_API_KEY` + `SLIPOK_BRANCH_ID` (`supabase secrets set …`) แล้วเพิ่มคอลัมน์ `slip_verify_status` / `slip_verify_data` / `slip_verified_at` บน `registration_batch` · **ถ้ายังไม่ตั้งคีย์ ฟังก์ชันจะคืนผลจำลอง (status `demo`)** ให้ UI ใช้ได้ก่อน

### Deployment (Vercel)
deploy เป็น Next.js app ปกติ — กำหนดค่า `NEXT_PUBLIC_*` ทั้งหมดใน Environment Variables ของ Vercel ให้ตรงกับ `.env.local`

---

## โครงสร้างโปรเจกต์ (Project Structure)

```
TesujiReg/
├─ app/                       # Next.js App Router (routes)
│  ├─ page.tsx                # หน้าแรก
│  ├─ schedule/ rules/        # หน้าข้อมูล
│  ├─ login/ signup/ profile/ account/   # บัญชีผู้ใช้
│  ├─ register/               # ขั้นตอนสมัคร (applicant, categories, payment, success, expired)
│  ├─ participants/           # รายชื่อผู้เข้าแข่งขัน
│  ├─ admin/                  # หลังบ้าน (tournament, categories, registrations, database, institutes)
│  ├─ providers.tsx           # AppStore + Auth + Toast providers
│  └─ layout.tsx, globals.css
├─ components/
│  ├─ ui/                     # primitives (Button, Card, Sheet, form, Toast, feedback, …)
│  ├─ admin/                  # หน้าจอแอดมิน
│  ├─ auth/                   # AuthProvider, AccountMenu
│  ├─ register/               # PersonFields, RankPicker, PromptPayQR, SlipUploader, …
│  ├─ home/ participants/ account/
│  └─ PublicHeader.tsx
├─ lib/
│  ├─ data/                   # ★ DataLayer seam
│  │  ├─ types.ts             # interface DataLayer + โดเมนไทป์ทั้งหมด
│  │  ├─ index.ts             # สลับ backend ตาม NEXT_PUBLIC_DATA_BACKEND
│  │  ├─ SupabaseDataLayer.ts # impl จริง (Postgres/Auth/Storage/RPC)
│  │  ├─ MockDataLayer.ts     # impl localStorage (เดโม)
│  │  ├─ store.tsx            # React provider + useLiveQuery
│  │  └─ supabaseClient.ts
│  ├─ rank.ts                 # แคตาล็อกระดับฝีมือ (power_level 0..22) + กฎ eligibility
│  ├─ age.ts                  # คำนวณอายุจากวันเกิด + กฎ eligibility ช่วงอายุ
│  ├─ provinces.ts            # รายชื่อ 77 จังหวัด (province picker)
│  ├─ promptpay.ts            # สร้าง Thai-QR payload จาก merchant QR (K SHOP) แบบฝังยอด
│  ├─ retry.ts                # auto-retry (backoff+jitter) สำหรับ read ตอนระบบแน่น
│  ├─ schedule.ts             # serialize/parse กำหนดการแบบจัดกลุ่มตามรุ่น
│  ├─ go-database.ts          # parser DAN/KYU/AWARD (Excel + CSV/Google Sheets) + normalize ชื่อไทย
│  ├─ validation/schemas.ts   # zod schemas
│  ├─ admin-auth.ts           # admin passphrase gate
│  ├─ demo-seed.ts, image.ts, utils.ts
├─ supabase/functions/
│  ├─ sync-go-database/        # Edge Function: ดึง Google Sheet (CSV) ฝั่ง server เลี่ยง CORS
│  └─ verify-slip/             # Edge Function: ตรวจสลิปผ่าน SlipOK ฝั่ง server (มีโหมดเดโม)
├─ docs/rank-databases.md     # สเปกไฟล์ Excel/CSV 3 ฐาน
├─ ARCHITECTURE.md
├─ CONTRIBUTING.md
└─ .env.example
```

---

## สถาปัตยกรรม (Architecture)

หัวใจของโปรเจกต์คือ **`DataLayer` seam** — อ่าน/เขียนข้อมูลทุกอย่างผ่าน interface เดียว (`lib/data/types.ts`) ที่มี 2 implementation:

- **`SupabaseDataLayer`** — backend จริง (Postgres + Auth + Storage + SECURITY DEFINER RPC)
- **`MockDataLayer`** — `localStorage` ล้วน ๆ สำหรับเดโม/พัฒนา โดยไม่ต้องมี backend

เลือกด้วย env `NEXT_PUBLIC_DATA_BACKEND` ใน `lib/data/index.ts` — **UI ไม่เคยรู้ว่าใช้ backend ไหน**

ระดับฝีมือเก็บเป็นจำนวนเต็ม `power_level` **0..22** (15 kyu..1 kyu = 0..14, 1 dan..8 dan = 15..22; kyu สูงสุดที่ 15 และไม่ข้ามไปดั้ง — ดั้งมาจากฐาน Dan เท่านั้น) และการ **กันโกงรุ่น** (ทั้งระดับฝีมือ **และอายุ**) ทำที่ฝั่งเซิร์ฟเวอร์: RPC `reserve_seats` จะอ่าน `power_level` + วันเกิดที่เชื่อถือได้จากโปรไฟล์/ผู้เล่นในความดูแลเอง **โดยไม่สนค่าที่ client ส่งมา** แล้วเช็คช่วงระดับ/อายุของรุ่นก่อนตัดที่นั่ง

👉 รายละเอียดเต็ม (ไดอะแกรม seam, flow การจอง, RLS/ความปลอดภัย) อยู่ใน **[ARCHITECTURE.md](./ARCHITECTURE.md)**

---

## Backend (Supabase)

- **ตารางหลัก:** `tournament` (กำหนดการเก็บเป็น JSON ใน `schedule_text`, กติกาเก็บ URL ของ PDF ใน `rules_text`), `category` (ตัวนับ `seats_taken` + เช็คห้ามจองเกิน + `combinable_category_ids`), `registration_batch` (มี `slip_verify_status` / `slip_verify_data` / `slip_verified_at`), `registration_seat`, `seat_hold`, `seat_hold_line`, `profile`, `managed_player`, `app_config`, `go_player_database`, `go_institute`
- **ฟิลด์ผู้สมัคร (PII):** `profile` / `managed_player` / `registration_seat` มี `province`, `institute_id` (→ `go_institute`), `institute_name`, `pdpa_consent`, `pdpa_consent_at` — `reserve_seats` snapshot ค่าเหล่านี้จากเรคคอร์ดต้นทางลงที่นั่ง
- **RPC สำคัญ:** `reserve_seats` (จองที่นั่ง all-or-nothing + กันโกงรุ่นทั้งระดับฝีมือ/อายุ + กันสมัครซ้ำ + เช็ครุ่นที่เล่นควบกันได้ + snapshot จังหวัด/สถาบัน/PDPA), `release_expired_holds` (คืนที่นั่งหมดเวลา — pg_cron ทุกนาที + lazy), `search_go_player_database`, `replace_go_player_database_source`, `find_or_create_institute` (พิมพ์เพิ่มสถาบันใหม่), `upsert_institute` / `delete_institute` / `admin_list_institutes` (จัดการสถาบัน), `admin_update_seat` / `admin_delete_seat` / `admin_delete_batch` (แก้ไข/ลบผู้สมัคร) และ RPC ฝั่งแอดมินสำหรับจัดการรายการแข่ง/รุ่น/ใบสมัคร
- **Edge Functions:** `verify-slip` (ตรวจสลิปผ่าน SlipOK ฝั่ง server — มีโหมดเดโม), `sync-go-database` (ดึง Google Sheet CSV เลี่ยง CORS)
- **ความปลอดภัย:** RLS เปิดสิทธิ์เฉพาะเจ้าของบนตาราง PII (`profile`/`managed_player`); anon/ผู้ใช้อ่านได้แค่ `tournament`/`category`/`go_institute`; ที่เหลือผ่าน RPC / Edge Function ที่ป้องกันด้วย admin passphrase (`app_config.admin_secret`); คีย์ SlipOK อยู่ใน Edge Function secrets ไม่หลุดมาเบราว์เซอร์
- **Storage:** bucket สาธารณะสำหรับแบนเนอร์ + สลิปการชำระเงิน + ไฟล์ PDF กติกา

---

## เอกสารเพิ่มเติม (Documentation)

- 📐 **[ARCHITECTURE.md](./ARCHITECTURE.md)** — DataLayer seam, โมเดลระดับฝีมือ, โมเดลความปลอดภัย, backend Supabase แบบละเอียด
- 📊 **[docs/rank-databases.md](./docs/rank-databases.md)** — สเปกไฟล์ Excel ทั้ง 3 ฐาน (DAN/KYU/AWARD) + กฎแปลงเป็น power_level + การจับคู่ชื่อ
- 🤝 **[CONTRIBUTING.md](./CONTRIBUTING.md)** — แนวทางพัฒนา/ส่ง PR

> **หมายเหตุความปลอดภัย:** `NEXT_PUBLIC_ADMIN_PASSPHRASE` เป็นตัวแปร `NEXT_PUBLIC_` จึงถูกฝังลงใน bundle ฝั่งเบราว์เซอร์ — เป็น **ประตูระดับเดโม ไม่ใช่ความปลอดภัยจริง** สำหรับใช้งานจริงควรตั้งค่าให้แข็งแรง (และอัปเดต `app_config.admin_secret` ให้ตรงกัน) หรือเปลี่ยนไปใช้ Supabase Auth + role เป็นชั้นถัดไป

---

## License

[MIT](./LICENSE) © 2026 nackkrmt

<sub>สร้างด้วย ❤️ สำหรับชุมชนหมากล้อมไทย · Built with Next.js + Supabase</sub>
