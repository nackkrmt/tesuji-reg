# Contributing to TesujiReg

ขอบคุณที่สนใจร่วมพัฒนา! สรุปแนวทางสั้น ๆ ด้านล่าง

## Prerequisites
- Node.js **24** และ npm — ตรงกับ `package.json` (`engines: { node: "24.x" }`), `.nvmrc` และ `node-version` ใน CI
- อ่าน [README.md](./README.md) (setup) และ [ARCHITECTURE.md](./ARCHITECTURE.md) (โครงสร้าง) ก่อนเริ่ม
- `npm run dev` รันโหมด mock (localStorage) ให้อยู่แล้ว — ไม่ต้องมี Supabase และไม่ต้องมีไฟล์ env
  เลย งาน UI เกือบทั้งหมดทำจบได้ในโหมดนี้ · ถ้าต้องชนฐานข้อมูลจริงให้ใช้ `npm run dev:supabase`
  ซึ่งจะพิมพ์ชื่อโปรเจกต์ที่กำลังจะเขียนถึงก่อนสตาร์ท (repo นี้มีโปรเจกต์ Supabase ตัวเดียว = production)

## Workflow
1. แตกสาขาใหม่จาก `main` — ตั้งชื่อแบบ `feat/...`, `fix/...`, `docs/...`, `refactor/...`
2. เขียนโค้ดให้เข้ากับสไตล์ไฟล์รอบ ๆ (naming, comment density, idiom เดิม)
3. ก่อนเปิด Pull Request ให้รันทั้งสี่อย่างนี้ให้ผ่าน — ชุดเดียวกับที่ `.github/workflows/ci.yml` รัน:
   ```bash
   npm run lint       # eslint .
   npm run typecheck  # tsc --noEmit
   npm test           # vitest run
   npm run build
   ```
   ถ้าแก้อะไรใต้ `supabase/functions/` (Deno, อยู่นอก tsconfig และนอก eslint) ให้รัน
   `deno task --config supabase/functions/deno.json check` ด้วย
4. PR หนึ่งอัน = หนึ่งเรื่อง อธิบายสิ่งที่เปลี่ยนและเหตุผลให้ชัดเจน

> ⚠️ **`main` deploy production ทันทีที่ push** ไม่มี preview branch ให้ซ้อมอีกแล้ว และ CI **ไม่ได้
> บล็อก** deploy (Vercel build push เดียวกันขนานไป) — ด่านจริงคือการรันสี่คำสั่งข้างบนก่อน push

## Commit messages
ใช้สไตล์ conventional-ish: `type: สรุปสั้น` เช่น `feat: add rank picker`,
`fix: guard register layout against stale profile`

## Code style & gotchas
- **TypeScript strict** — หลีกเลี่ยง `any` เท่าที่ทำได้ และห้ามทำให้ type ใหม่หลุด
  จาก `lib/data/types.ts` (interface `DataLayer` เป็นสัญญากลาง — แก้ทั้ง Supabase และ Mock ให้ตรงกันเสมอ)
- ทุกการอ่าน/เขียนข้อมูลต้องผ่าน `DataLayer` — **ห้าม** เรียก Supabase ตรงจาก UI
  (ข้อยกเว้นที่จงใจ: โมดูลแข่งสดใน `lib/live/` และ `app/live`, `app/judge`, `app/api/divisions`
  อยู่นอก seam เพื่อคงความเข้ากันได้กับโปรแกรมจับคู่ MacMahon — ดู ARCHITECTURE §7)
- ⚠️ **ESLint gotcha (ยังใช้อยู่หลังย้ายเป็น flat config):** `eslint.config.mjs` bridge
  preset `next/core-web-vitals` ผ่าน `FlatCompat` และ preset นั้น **ไม่ได้โหลด** rule
  `@typescript-eslint/no-explicit-any` ดังนั้นคอมเมนต์
  `// eslint-disable-next-line @typescript-eslint/no-explicit-any` จะทำให้ lint
  พังด้วย error "rule not found" — ถ้าจำเป็นต้องใช้ `any` ให้ใช้เปล่า ๆ โดยไม่ต้องใส่ disable comment
- **ตัวแปรที่ไม่ได้ใช้ไม่มีอะไรจับ** — `next/core-web-vitals` ไม่ได้โหลด `no-unused-vars` /
  `@typescript-eslint/no-unused-vars` และ `tsconfig.json` ไม่ได้ตั้ง `noUnusedLocals` /
  `noUnusedParameters` เลย import หรือตัวแปรที่ตายแล้วจึงผ่านทั้ง `lint` และ `typecheck`
  (เอกสารนี้เคยบอกว่ามันเป็น error และแนะนำ `void x;` — ไม่จริงทั้งคู่) เก็บกวาดด้วยตาแทน
  หรือถ้าจะให้เครื่องช่วย ต้องเปิดสองออปชันนั้นใน `tsconfig.json` แล้วตามแก้ทั้ง repo
- **lint คือ `eslint .` ไม่ใช่ `next lint`** — Next 15 deprecate `next lint` และ 16 เอาออก
  ไฟล์ที่ยกเว้นไว้ใน flat config: `supabase/functions/**` (Deno), `public/live-assets/**`
  (vanilla JS ของกระดานผลสด), `.next/`, `backups/`
- ห้าม commit ความลับ — ค่าจริงอยู่ใน `.env` (gitignore ไว้แล้ว พร้อม `.env.development`,
  `.env.production`, `.env*.local`); `.env.example` ใส่เฉพาะ placeholder
- ข้อความที่ผู้ใช้เห็นอยู่ใน `lib/i18n/dictionaries/{th,en}.ts` — ไทยเป็นต้นฉบับ อังกฤษ mirror
  เพิ่ม key ใหม่ต้องใส่ **ทั้งสองไฟล์**

## Project layout (ย่อ)
- `app/` — routes (App Router) · `components/` — UI · `lib/data/` — DataLayer seam
- `lib/rank.ts`, `lib/go-database.ts`, `lib/validation/schemas.ts` — โดเมนหลัก
- `supabase/` — schema baseline + bootstrap + migrations + edge functions
  (เขียน migration อย่างไร: [docs/DEV-SETUP.md](./docs/DEV-SETUP.md#schema-changes))
