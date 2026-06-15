# 碁 TesujiReg

> ระบบรับสมัครแข่งขันกีฬาหมากล้อม (Go / 囲碁 / Weiqi) — มือถือมาก่อน, ภาษาไทย
> _A mobile-first registration system for Go tournaments._

[![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20Auth-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-38BDF8?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

TesujiReg ช่วยให้ผู้จัดการแข่งขันหมากล้อมเปิดรับสมัครออนไลน์ได้ครบวงจร — ผู้เล่นสมัครเอง / โค้ช-ผู้ปกครองสมัครให้ลูกทีม, เลือกรุ่นตามระดับฝีมือ (พร้อมระบบกันโกงรุ่น), จ่ายเงินผ่าน PromptPay QR แล้วอัปสลิป, และแอดมินตรวจ-ยืนยันใบสมัครได้จากหลังบ้าน

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
- 👤 **บัญชีผู้ใช้** — สมัครสมาชิก/เข้าสู่ระบบด้วยอีเมล+รหัสผ่าน (Supabase Auth); กรอกโปรไฟล์ครั้งเดียว ครั้งต่อไปเติมให้อัตโนมัติ
- 👨‍👩‍👧 **ผู้เล่นในความดูแล (managed players)** — โค้ช/ผู้ปกครองบันทึกรายชื่อลูกทีมไว้ใช้สมัครซ้ำได้
- 📝 **สมัครแข่ง (ต้องล็อกอินก่อน)** — เลือกผู้เข้าแข่งขัน → เลือกรุ่นให้แต่ละคน → สรุป → จ่ายเงิน
- 🎟️ **จองที่นั่ง 15 นาที** — ตัดโควตาแบบ all-or-nothing พร้อมตัวนับถอยหลัง, หมดเวลาแล้วคืนที่นั่งอัตโนมัติ
- 💳 **PromptPay QR + อัปสลิป** — สร้าง QR ตามยอด แล้วอัปโหลดสลิปเพื่อรอตรวจ
- 🏅 **ระดับฝีมือ (Go rank) + กันโกงรุ่น** — ตรวจสิทธิ์เข้ารุ่นตามช่วงระดับฝีมือ บังคับจากฝั่งเซิร์ฟเวอร์
- ✅ **ยืนยันระดับฝีมือจาก 3 ฐานข้อมูล** — DAN / KYU / AWARD จับคู่ด้วยชื่อ; ไม่พบ → ระบุเอง (รอแอดมินอนุมัติ)

**ฝั่งแอดมิน (Admin — ป้องกันด้วย passphrase)**
- ⚙️ ตั้งค่ารายการแข่ง (ชื่อ, แบนเนอร์, วันเวลาเปิด-ปิดรับ, PromptPay, กำหนดการ, กติกา)
- 🗂️ จัดการรุ่น/หมวด (โควตา, ค่าสมัคร, ช่วงระดับฝีมือ min/max)
- 📋 ตรวจ-ยืนยัน/ปฏิเสธใบสมัคร + ดูสลิป, หน้ารวมรายชื่อผู้เข้าแข่งขัน
- 🥇 หน้าอนุมัติระดับฝีมือ (รายการที่ระบุเอง → ค้นฐานข้อมูลเทียบ → อนุมัติ/แก้ระดับ)
- 📥 อัปโหลดฐานข้อมูลระดับฝีมือจากไฟล์ Excel (DAN/KYU/AWARD)

**Routes**

| Path | คำอธิบาย |
|---|---|
| `/` | หน้าแรก + ข้อมูลรายการแข่ง |
| `/schedule`, `/rules` | กำหนดการ / กติกา |
| `/login`, `/signup` | เข้าสู่ระบบ / สมัครสมาชิก |
| `/profile`, `/account` | โปรไฟล์ตัวเอง / ผู้เล่นในความดูแล |
| `/register` → `/register/applicant` → `/register/categories` → `/register/payment` → `/register/success` | ขั้นตอนสมัครแข่ง (+ `/register/expired` เมื่อหมดเวลาจอง) |
| `/participants` | รายชื่อผู้เข้าแข่งขัน (สาธารณะ) |
| `/admin/*` | หลังบ้าน: `login`, `tournament`, `categories`, `registrations`, `registrations/[id]`, `ranks`, `database` |

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
| [promptpay-qr](https://www.npmjs.com/package/promptpay-qr) + [qrcode.react](https://www.npmjs.com/package/qrcode.react) | ^0.5 / ^4.1 | สร้าง PromptPay QR |
| [xlsx (SheetJS)](https://sheetjs.com/) | ^0.18 | อ่านไฟล์ Excel ฐานข้อมูลระดับฝีมือ |

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

> 🧪 **โหมดเดโมแบบไม่มี backend:** ตั้ง `NEXT_PUBLIC_DATA_BACKEND=mock` แล้วรัน `npm run dev` ได้เลย — ทุกอย่างทำงานบน `localStorage` ไม่ต้องตั้ง Supabase

### Supabase setup (สำหรับ backend จริง)
1. สร้างโปรเจกต์ Supabase แล้วลง schema + RPC (ตาราง/ฟังก์ชันตามที่อธิบายใน [ARCHITECTURE.md](./ARCHITECTURE.md))
2. ใส่ `NEXT_PUBLIC_SUPABASE_URL` และ `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` ใน `.env.local`
3. **ขั้นตอนต้องทำเองใน Dashboard (ตั้งผ่าน SQL ไม่ได้):** Authentication → Sign In / Providers → Email → ปิด **"Confirm email"** เพื่อให้สมัครแล้วล็อกอินได้ทันที (ถ้าเปิดไว้ แอปจะแสดงหน้า "ตรวจสอบอีเมล" ให้)
4. ตั้ง `NEXT_PUBLIC_ADMIN_PASSPHRASE` ให้ตรงกับ `app_config.admin_secret`

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
│  ├─ admin/                  # หลังบ้าน (tournament, categories, registrations, ranks, database)
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
│  ├─ rank.ts                 # แคตาล็อกระดับฝีมือ (power_level 0..25) + กฎ eligibility
│  ├─ go-database.ts          # parser Excel DAN/KYU/AWARD + normalize ชื่อไทย
│  ├─ validation/schemas.ts   # zod schemas
│  ├─ admin-auth.ts           # admin passphrase gate
│  ├─ demo-seed.ts, image.ts, utils.ts
├─ docs/rank-databases.md     # สเปกไฟล์ Excel 3 ฐาน
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

ระดับฝีมือเก็บเป็นจำนวนเต็ม `power_level` **0..25** (9×9=0, 13×13=1, 15 kyu..1 kyu = 2..16, 1 dan..9 dan = 17..25; kyu สูงสุดที่ 15) และการ **กันโกงรุ่น** ทำที่ฝั่งเซิร์ฟเวอร์: RPC `reserve_seats` จะอ่าน `power_level` ที่เชื่อถือได้จากโปรไฟล์/ผู้เล่นในความดูแลเอง **โดยไม่สนค่าที่ client ส่งมา** แล้วเช็คช่วงของรุ่นก่อนตัดที่นั่ง

👉 รายละเอียดเต็ม (ไดอะแกรม seam, flow การจอง, RLS/ความปลอดภัย) อยู่ใน **[ARCHITECTURE.md](./ARCHITECTURE.md)**

---

## Backend (Supabase)

- **ตารางหลัก:** `tournament`, `category` (ตัวนับ `seats_taken` + เช็คห้ามจองเกิน), `registration_batch`, `registration_seat`, `seat_hold`, `seat_hold_line`, `profile`, `managed_player`, `app_config`, `go_player_database`
- **RPC สำคัญ:** `reserve_seats` (จองที่นั่ง all-or-nothing + กันโกงรุ่น), `release_expired_holds` (คืนที่นั่งหมดเวลา — pg_cron ทุกนาที + lazy), `search_go_player_database`, `replace_go_player_database_source`, `admin_list_pending_ranks`, `admin_set_rank_status` และ RPC ฝั่งแอดมินสำหรับจัดการรายการแข่ง/รุ่น/ใบสมัคร
- **ความปลอดภัย:** RLS เปิดสิทธิ์เฉพาะเจ้าของบนตาราง PII (`profile`/`managed_player`); anon อ่านได้แค่ `tournament`/`category`; ที่เหลือผ่าน RPC ที่ป้องกันด้วย admin passphrase (`app_config.admin_secret`)
- **Storage:** bucket สาธารณะสำหรับแบนเนอร์ + สลิปการชำระเงิน

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
