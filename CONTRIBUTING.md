# Contributing to TesujiReg

ขอบคุณที่สนใจร่วมพัฒนา! สรุปแนวทางสั้น ๆ ด้านล่าง

## Prerequisites
- Node.js 18+ และ npm
- อ่าน [README.md](./README.md) (setup) และ [ARCHITECTURE.md](./ARCHITECTURE.md) (โครงสร้าง) ก่อนเริ่ม
- ใช้ `NEXT_PUBLIC_DATA_BACKEND=mock` ใน `.env.local` เพื่อพัฒนา/ทดสอบโดยไม่ต้องมี Supabase

## Workflow
1. แตกสาขาใหม่จาก `main` — ตั้งชื่อแบบ `feat/...`, `fix/...`, `docs/...`, `refactor/...`
2. เขียนโค้ดให้เข้ากับสไตล์ไฟล์รอบ ๆ (naming, comment density, idiom เดิม)
3. ก่อนเปิด Pull Request ให้รันทั้งสองอย่างนี้ให้ผ่าน:
   ```bash
   npm run lint
   npm run build
   ```
4. PR หนึ่งอัน = หนึ่งเรื่อง อธิบายสิ่งที่เปลี่ยนและเหตุผลให้ชัดเจน

## Commit messages
ใช้สไตล์ conventional-ish: `type: สรุปสั้น` เช่น `feat: add rank picker`,
`fix: guard register layout against stale profile`

## Code style & gotchas
- **TypeScript strict** — หลีกเลี่ยง `any` เท่าที่ทำได้ และห้ามทำให้ type ใหม่หลุด
  จาก `lib/data/types.ts` (interface `DataLayer` เป็นสัญญากลาง — แก้ทั้ง Supabase และ Mock ให้ตรงกันเสมอ)
- ทุกการอ่าน/เขียนข้อมูลต้องผ่าน `DataLayer` — **ห้าม** เรียก Supabase ตรงจาก UI
- ⚠️ **ESLint gotcha:** preset `next/core-web-vitals` ที่ใช้อยู่ **ไม่ได้โหลด**
  rule `@typescript-eslint/no-explicit-any` ดังนั้นคอมเมนต์
  `// eslint-disable-next-line @typescript-eslint/no-explicit-any` จะทำให้ build
  พังด้วย error "rule not found" — ถ้าจำเป็นต้องใช้ `any` ให้ใช้เปล่า ๆ โดยไม่ต้องใส่ disable comment
- ตัวแปร/พารามิเตอร์ที่ไม่ได้ใช้ถูกจับเป็น error — แมป field ให้ครบหรือใช้ `void x;`
- ห้าม commit ความลับ — ค่าจริงอยู่ใน `.env.local` (gitignore ไว้แล้ว); `.env.example`
  ใส่เฉพาะ placeholder

## Project layout (ย่อ)
- `app/` — routes (App Router) · `components/` — UI · `lib/data/` — DataLayer seam
- `lib/rank.ts`, `lib/go-database.ts`, `lib/validation/schemas.ts` — โดเมนหลัก
