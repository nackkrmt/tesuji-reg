# 碁 TesujiReg

> ระบบรับสมัครแข่งขันกีฬาหมากล้อม (Go / 囲碁 / Weiqi) — มือถือมาก่อน, ภาษาไทย
> _A mobile-first registration system for Go tournaments._

[![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20Auth-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-38BDF8?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

TesujiReg ช่วยให้ผู้จัดการแข่งขันหมากล้อมเปิดรับสมัครออนไลน์ได้ครบวงจร — ผู้เล่นสมัครเอง / โค้ช-ผู้ปกครองสมัครให้ลูกทีม, เลือกรุ่นตามระดับฝีมือ (พร้อมระบบกันโกงรุ่น), จ่ายเงินผ่าน QR ร้านค้า (K SHOP / Thai-QR) แล้วอัปสลิป (ตรวจอัตโนมัติด้วย SlipOK), และแอดมินตรวจ-ยืนยันใบสมัครได้จากหลังบ้าน หลังสมัครแล้วผู้สมัครยัง **ถอนตัว / เปลี่ยนคน** ได้ด้วยตัวเอง, ตามผลแข่งสดได้ที่หน้า `/live` พร้อมคอนโซลกรรมการ (เชื่อมกับโปรแกรมจับคู่ MacMahon ได้), และสลับภาษา **ไทย/อังกฤษ** ได้ทั้งแอป

---

## สารบัญ / Table of Contents

- [ฟีเจอร์ (Features)](#ฟีเจอร์-features)
- [Tech Stack](#tech-stack)
- [เริ่มต้นใช้งาน (Getting Started)](#เริ่มต้นใช้งาน-getting-started)
- [โครงสร้างโปรเจกต์ (Project Structure)](#โครงสร้างโปรเจกต์-project-structure)
- [สถาปัตยกรรม (Architecture)](#สถาปัตยกรรม-architecture)
- [ระบบผลสด & กรรมการ (Live & Judge)](#ระบบผลสด--กรรมการ-live--judge)
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
- 📄 **"ใบสมัครของฉัน"** — ดูใบสมัครทั้งหมดของตัวเองพร้อมสถานะ; ใบที่ **รอชำระเงิน** มีปุ่ม **"ชำระเงิน / ดู QR"** กลับไปจ่ายต่อได้เสมอ แม้ปิดแท็บ/แอปไปแล้วก่อนอัปสลิป (สร้าง QR ใหม่จากข้อมูลฝั่งเซิร์ฟเวอร์); ใบที่หมดอายุถูกพับเก็บ (กดขยายดูได้); หน้า `/register/success` สรุปผลการสมัคร (รหัสอ้างอิง, รายชื่อ, รุ่น, ส่วนลด, ยอดรวม, สถานะ) พร้อมคำเตือนให้เก็บหลักฐานไว้
- ↩️ **ถอนตัว (Withdraw)** — เจ้าของใบสมัครถอนผู้เล่นออกเป็น **รายที่นั่ง** ได้เองจาก "ใบสมัครของฉัน" (ได้ทั้งใบที่ยืนยันแล้วและรอตรวจสลิป, ไม่มีกำหนดเส้นตาย) โดยกรอกบัญชีรับเงินคืน + เหตุผล — **การคืนเงินอยู่ในดุลยพินิจผู้จัด**; ที่นั่งคืนเข้าโควตาให้คนอื่นสมัครต่อ, ชื่อหายจากรายชื่อสาธารณะ, ยอดเงินของใบสมัครไม่เปลี่ยน — แอดมินตั้งสถานะ **"คืนเงินแล้ว"** ได้ต่อเมื่อ**แนบสลิปหลักฐานการโอนคืน** (เก็บใน bucket ส่วนตัว) และสถานะจะ**ล็อกถาวร**; ยอดที่คืนแล้วถูก**หักออกจากรายได้บนแดชบอร์ด**อัตโนมัติ
- 🔄 **เปลี่ยนคน (Swap)** — เปลี่ยนผู้เล่นในที่นั่งเป็นตัวเอง/ผู้เล่นในความดูแลคนอื่น และเลือกย้ายไปรุ่นอื่นที่ **ค่าสมัครเท่ากัน** ในงานเดียวกันได้ (เงินไม่ขยับ); ทำได้จนถึงปิดรับสมัคร — เซิร์ฟเวอร์ตรวจสิทธิ์ใหม่ครบชุด (ระดับฝีมือ / อายุ / สมัครซ้ำข้ามบัญชี / รุ่นควบ / เพดานรางวัล 1 คิว)
- 🎟️ **โค้ดส่วนลด / สมัครฟรี** — ผู้สมัครกรอกโค้ดในหน้าจ่ายเงิน → ลดราคา (เปอร์เซ็นต์/จำนวนเงิน) หรือ **สมัครฟรี** (ข้าม QR + สลิป ยืนยันอัตโนมัติทันที); ส่วนลดคิดฝั่งเซิร์ฟเวอร์ทั้งหมด (QR/ตรวจสลิปลดตามเอง) และนับโควต้าการใช้ตอนยืนยันจริงเท่านั้น
- 📖 **อ่านกติกาในแอปได้เลย** — หน้า `/rules` แสดงกฎ กติกาแบบแบ่งหัวข้อ แต่ละหัวข้อประกอบด้วยบล็อกเนื้อหาที่แอดมินจัดไว้ (หัวข้อย่อย/ข้อความ/รายการมีเลข/**ตาราง**/เส้นคั่น/กล่องหมายเหตุ) อ่านง่ายบนมือถือ
- 🚫 **กันสมัครซ้ำรุ่นเดิม — ข้ามทุกบัญชี** — คนเดียวสมัครรุ่นเดียวกันซ้ำไม่ได้ โดยจับคู่ตัวตนด้วย **ชื่อไทยแบบ normalize** (`normalize_thai_name`) ข้ามทุกบัญชี/ผู้เล่นในความดูแลทั้งระบบ (เช็คฝั่งเซิร์ฟเวอร์ ข้ามใบสมัคร) — ปิดช่องคนเดียวกันสมัครซ้ำผ่านคนละบัญชี; ใช้เกณฑ์เดียวกันกับเช็ครุ่นที่เล่นควบกันได้
- 🏅 **ระดับฝีมือ (Go rank) + จำกัดอายุ + กันโกงรุ่น** — ตรวจสิทธิ์เข้ารุ่นตามช่วงระดับฝีมือ **และช่วงอายุ** บังคับจากฝั่งเซิร์ฟเวอร์; หน้าเลือกรุ่นจะโชว์ **เฉพาะรุ่นที่ผู้สมัครมีสิทธิ์ลงจริง** (ไม่มีรุ่นที่เข้าเกณฑ์เลย → ขึ้นแจ้งชัดเจนแทนดรอปดาวน์ว่าง)
- ✅ **ยืนยันระดับฝีมือจาก 3 ฐานข้อมูล** — DAN / KYU / AWARD จับคู่ด้วยชื่อ (ค้น Dan ก่อน แล้ว Kyu/Award); **ไม่พบ → กำหนดเป็น 15 คิวอัตโนมัติ** (ไม่ต้องกรอกเอง/รออนุมัติ); จับคู่ผิด (เช่น fuzzy match ชื่อคล้ายกัน) ผู้สมัคร **แก้ไขระดับฝีมือเองได้** ("ไม่ใช่ระดับนี้" → เลือกจาก dropdown เอง, เข้าคิวรอแอดมินตรวจ)
- 🔗 **ระดับฝีมืออัปเดตตามฐานตลอด** — แทนที่จะ snapshot ตอนค้น ระบบผูกผู้ใช้เข้ากับ **ทะเบียนบุคคล `go_person`** (id คงที่, power_level resolve แล้วแบบ dan-first); แอดมินนำเข้า/กด Sync → ระดับของทุกคนที่ลิงก์ไว้ถูกอัปเดตตามฐานชุดใหม่อัตโนมัติ (ชื่อซ้ำหลายระดับที่ขัดกันจะข้ามไว้ให้ตรวจเอง, ชื่อที่หายจากฐานคงระดับเดิมไม่ลดเงียบ ๆ)
- 🚧 **เพดานรางวัลรุ่น 1 คิว** — ผู้เล่นที่ได้เหรียญรางวัล (อันดับ 1–2–3) รุ่น 1 คิว ครบ **3 ครั้ง** แต่ยัง **ไม่ผ่านดั้ง** จะถูกระงับการสมัคร **ทุกรุ่น** อัตโนมัติจนกว่าจะมีชื่อในฐานดั้ง (นับเฉพาะรางวัลรุ่น 1 คิว = `power_level 14`, นับแบบ distinct งาน) — บังคับฝั่งเซิร์ฟเวอร์ใน `reserve_seats` พร้อม **เตือนล่วงหน้าตอนกรอกชื่อ**
- 🌐 **สองภาษา ไทย/อังกฤษ** — สลับภาษาได้ทั้งแอป (`LanguageSwitcher`); ข้อความทั้งหมดอยู่ใน dictionaries (`lib/i18n/dictionaries/` — ไทยเป็นต้นฉบับ, อังกฤษ mirror) และจำภาษาไว้ในคุกกี้ `locale` ที่อ่านฝั่งเซิร์ฟเวอร์ตั้งแต่ first paint (ไม่มีอาการภาษากะพริบตอนโหลด)
- 📺 **ผลแข่งสด** — หน้า `/live` แสดงผลการแข่งขันแบบเรียลไทม์ (สาธารณะ ไม่ต้องล็อกอิน) — รายละเอียดที่ [ระบบผลสด & กรรมการ](#ระบบผลสด--กรรมการ-live--judge)
- 📱 **ติดตั้งเป็นแอปได้ (PWA)** — รองรับ Add to Home Screen ทั้ง iOS/Android เปิดแบบเต็มจอ (standalone) พร้อมไอคอนแบรนด์

**ฝั่งแอดมิน (Admin — ต้องล็อกอินด้วยบัญชีที่มี role `admin`)**
- ⚙️ ตั้งค่ารายการแข่ง (ชื่อ, แบนเนอร์, วันเวลาเปิด-ปิดรับ, ผู้รับเงิน — QR ร้านค้า K SHOP / Thai-QR, กำหนดการ, กติกา)
- 📅 **ตัวสร้างกำหนดการแบบมีโครงสร้าง** — จัดกลุ่มตามรุ่น (รุ่นที่แข่งเวลาเดียวกันรวมตารางเดียวได้) แล้วเพิ่มรายการทีละช่วงเวลาพร้อมประเภท (แข่งขัน/พิธีเปิด/พักเที่ยง/พิธีปิด/มอบรางวัล/จับฉลาก) + กระดานที่/หมายเหตุ
- 📖 **ตัวสร้างกฎ กติกาแบบบล็อก (block editor)** — เพิ่มหัวข้อ (เช่น กติกาการแข่งขัน, การรายงานตัว) แล้วต่อบล็อกเนื้อหาได้เอง (หัวข้อย่อย/ข้อความ/รายการ/**ตารางแก้ได้จริง** — เพิ่ม-ลบแถว/คอลัมน์ + ตั้งแถวหัวตาราง/เส้นคั่น/กล่องหมายเหตุ), เรียงลำดับบล็อกและหัวข้อได้อิสระ — แสดงผลตรงตามที่จัดไว้บนหน้า `/rules`
- 🎟️ **โค้ดส่วนลด / สมัครฟรี (เมนู `/admin/codes`)** — สร้างโค้ดต่อรายการแข่ง เลือกชนิดจาก dropdown (**สมัครฟรี / ลดเปอร์เซ็นต์ / ลดจำนวนเงิน**), กำหนด **จำนวนครั้งที่ใช้ได้** + **วันหมดอายุ**, เปิด/ปิด/แก้ไข/ลบ และดูจำนวนการใช้ต่อโค้ด
- 🗂️ จัดการรุ่น/หมวด (โควตา, ค่าสมัคร, ช่วงระดับฝีมือ min/max, **ช่วงอายุ min/max**, **รุ่นที่เล่นควบกันได้**)
- 📋 ตรวจ-ยืนยัน/ปฏิเสธใบสมัคร + ดูสลิป — **ค้นหารายชื่อ** (แสดงเป็นรายคน + ยอดที่ต้องโอน + จังหวัด/สถาบัน/สถานะ PDPA), หน้าใบสมัครโชว์ **ชื่อเจ้าของบัญชีที่สมัคร + อีเมล**, **แก้ไข/ลบผู้สมัครรายคนหรือทั้งใบ** (ปรับที่นั่ง/ยอดเงินให้อัตโนมัติ), หน้ารวมรายชื่อผู้เข้าแข่งขัน + **export รายชื่อ** เป็น CSV ทั้งงาน และไฟล์ `.txt` ต่อรุ่น (zip) สำหรับโปรแกรมจับคู่ MacMahon
- 💸 **รายการถอนตัว (เมนู `/admin/withdrawals`)** — ดูรายการถอนตัวทั้งหมดพร้อมบัญชีรับเงินคืน/เหตุผล + แผงสรุปยอด, ตั้งสถานะการคืนเงิน **รอดำเนินการ / คืนแล้ว / ปฏิเสธ** (`pending`/`refunded`/`denied`) — การโอนเงินคืนจริงทำนอกระบบ
- 🤖 **ตรวจสลิปอัตโนมัติ (SlipOK)** — ตรวจ **อัตโนมัติทันทีที่ผู้ใช้ส่งสลิป** (และแอดมินกดตรวจซ้ำได้): เทียบยอด, **เช็กบัญชีผู้รับ** (เตือน `receiver_mismatch` เมื่อโอนผิดบัญชี — ฟันธงได้กับ PromptPay เบอร์/บัตร, ส่วน merchant QR อาศัย branch-binding ของ SlipOK + ให้แอดมินดูประกอบ), ตรวจสลิปซ้ำ — ผ่าน Edge Function (คีย์อยู่ฝั่งเซิร์ฟเวอร์); ยังไม่ตั้งคีย์ → ทำงานแบบ **เดโม (ผลจำลอง)** ได้ทันที
- 🏫 **จัดการฐานข้อมูลสถาบันหมากล้อม** — ลิสต์กระชับ (ขยาย +/− เพื่อจัดการ) พร้อม **ค้นหา + เรียง** (ชื่อ ก–ฮ/ฮ–ก, เพิ่มล่าสุด, คำค้นมากสุด, **ผู้สมัครมากสุด** — โชว์จำนวนผู้สมัครต่อสถาบันด้วย); เพิ่ม/เปลี่ยนชื่อ/ปิดใช้งาน/ลบ — รองรับเป็นร้อยสถาบัน
- 🔎 **คำค้น (alias) ต่อสถาบัน** — ตั้งชื่อเล่น/ชื่อครู (เช่น "ครูม่อน") ให้สถาบัน เพื่อให้ผู้สมัครพิมพ์แล้วเจอแม้ไม่ตรงชื่อจริง
- 🔗 **รวมสถาบันที่ซ้ำกัน + แยกคืนได้** — รวมสถาบันซ้ำเข้าด้วยกัน (ย้ายผู้สมัครไปสถาบันหลัก + เก็บชื่อเดิมเป็นคำค้น แล้วลบตัวซ้ำ) ผ่านปุ่มเลือกที่ค้นหาได้; เก็บ **ประวัติการรวมแบบถาวร** กด "แยกคืน" ย้อนกลับเมื่อไรก็ได้
- 🔄 นำเข้าฐานข้อมูลระดับฝีมือ (DAN/KYU/AWARD) — **Sync จาก Google Sheets** (วางลิงก์ public แล้วกดดึงล่าสุด) หรืออัปโหลดไฟล์ Excel (.xlsx) เป็น fallback — **นำเข้าเสร็จจะซิงก์ระดับของผู้ใช้ที่ลิงก์ไว้ให้อัตโนมัติ**; มีปุ่ม "ซิงก์ระดับใหม่ทั้งหมด" + รายการที่นั่งที่ระดับปัจจุบันหลุดเกณฑ์รุ่นในหน้าเดียวกัน
- 🎫 **ยกเว้นเพดานรางวัล 1 คิว (ในหน้า `/admin/database`)** — เพิ่ม/ลบรายชื่อยกเว้นเป็นรายบุคคล เผื่อกรณีจับคู่ชื่อผิด (ชื่อ-นามสกุลซ้ำกับผู้เล่นคนอื่น) ให้ผู้ที่โดนระงับผิดพลาดสมัครได้ตามปกติ
- 🧨 **รีเซ็ตหลังจบงาน (เมนูแยก `/admin/reset`)** — เช็กลิสต์ **ติ๊กเลือกกลุ่มข้อมูลที่จะลบ** (ใบสมัคร+สลิป, โปรโมโค้ด, บัญชีผู้ใช้, สถาบัน, ฐานข้อมูลนักกีฬา, ข้อมูลแข่งสด, รุ่น, ทัวร์นาเมนต์) — กลุ่มที่ต้องพ่วงกัน (เช่น ลบรุ่นต้องล้างใบสมัครด้วย) **ติ๊กให้อัตโนมัติ**; ยืนยันครั้งเดียวด้วยการพิมพ์คำยืนยัน (เซิร์ฟเวอร์ตรวจซ้ำอีกชั้นทั้ง phrase และ dependency) — ลบถาวรย้อนกลับไม่ได้; **เก็บไว้เสมอ**: การตั้งค่าระบบ (`app_config`) และ**บัญชีของแอดมินที่กดเอง** (ไม่มีทางล็อกตัวเองออก)
- 📺 **ควบคุมการแข่งสด (เมนู `/admin/live`)** — จัดการรุ่น/ข้อมูลการแข่งสด, คัดลอกลิงก์คอนโซลกรรมการ + token สำหรับโปรแกรมจับคู่, และ danger zone ล้างข้อมูลสดทั้งหมด — ดู [ระบบผลสด & กรรมการ](#ระบบผลสด--กรรมการ-live--judge)
- 🧑‍⚖️ **จัดการกรรมการ (เมนู `/admin/judges`)** — แต่งตั้ง/ถอดถอนสิทธิ์กรรมการเป็นรายบัญชี (role `judge`; บัญชีเดียวถือได้ทั้ง `admin` + `judge`) ผ่าน `admin_set_judge` / `admin_list_judges` — กำหนดรุ่นเริ่มต้นต่อคน, ถอดสิทธิ์ต้องยืนยันก่อน

**Routes**

| Path | คำอธิบาย |
|---|---|
| **สาธารณะ / ผู้ใช้** | |
| `/` | หน้าแรก + ข้อมูลรายการแข่ง |
| `/schedule`, `/rules` | กำหนดการ / กติกา |
| `/login`, `/signup` | เข้าสู่ระบบ / สมัครสมาชิก |
| `/forgot-password`, `/reset-password` | ขอลิงก์รีเซ็ตรหัสผ่าน / ตั้งรหัสผ่านใหม่ |
| `/profile`, `/account` | โปรไฟล์ตัวเอง / ผู้เล่นในความดูแล |
| `/register` → `/register/applicant` → `/register/categories` → `/register/payment` → `/register/success` | ขั้นตอนสมัครแข่ง (+ `/register/expired` เมื่อหมดเวลาจอง; `/register/payment?batch=<id>` = กลับไปจ่ายใบที่ค้างจาก "ใบสมัครของฉัน") |
| `/my-registrations` | ใบสมัครของฉัน — สถานะ, ปุ่มกลับไปจ่ายเงิน, **ถอนตัว / เปลี่ยนคน** |
| `/participants` | รายชื่อผู้เข้าแข่งขัน (สาธารณะ) — แสดงสถานะ ยืนยันแล้ว / รอตรวจสลิป (ไม่รวมผู้ถอนตัว) |
| **ผลสด & API** | |
| `/live` | หน้าผลแข่งสดสาธารณะ (raw HTML — ไม่ผ่าน React app) |
| `/live/snapshot` | JSON snapshot ของสถานะการแข่งสดทั้งหมด (สำหรับ polling) |
| `/judge/[key]` | คอนโซลกรรมการ — `key` คือ live token (ตรวจผ่าน `live_check_token`) + ต้องล็อกอินด้วยบัญชี role `judge` |
| `/api/divisions`, `/api/divisions/[id]/{matches,result,rounds/[round],standings,checkin,force}` | REST API สำหรับโปรแกรมจับคู่ MacMahon-TESUJI (`.jar`) |
| **แอดมิน** | |
| `/admin/*` | หลังบ้าน: `login`, `tournament`, `categories`, `registrations`, `registrations/[id]`, `withdrawals`, `live`, `judges`, `database`, `institutes`, `codes`, `reset` |

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
| [xlsx (SheetJS)](https://sheetjs.com/) | 0.20.3 | อ่าน Excel/CSV ฐานข้อมูลระดับฝีมือ (รวม Google Sheets sync) — ใช้ build จาก **SheetJS CDN ที่แพตช์ช่องโหว่แล้ว** (แพ็กเกจใน npm registry เลิกดูแล) |

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
| `NEXT_PUBLIC_DEFAULT_MERCHANT_QR` | (ออปชัน) Thai-QR ร้านค้าตั้งต้นสำหรับผู้จัดรายเดียว — วาง payload static (เช่น export จาก K SHOP, ขึ้นต้น `00020101…`) แล้วรายการแข่งใหม่จะใช้เป็นผู้รับเงินอัตโนมัติ; เว้นว่าง = แอดมินวาง Thai-QR ของร้านเองในฟอร์มตั้งค่ารายการแข่ง |

> ℹ️ โค้ดยังรับ `NEXT_PUBLIC_SUPABASE_ANON_KEY` เป็น fallback ของ `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (เผื่อ deployment เก่า) — ตัวแปรหลักที่ควรใช้คือ `PUBLISHABLE_KEY`
>
> 🔑 **สิทธิ์แอดมินไม่ใช่ env var** — ผูกกับบัญชี Supabase Auth เป็นรายบัญชี (role `admin` ใน `account_roles`) ดูขั้นตอนที่ 4 ใน _Supabase setup_ ด้านล่าง

> 🔐 **คีย์ SlipOK ไม่ใช่ตัวแปร `NEXT_PUBLIC_`** — ตั้งเป็น **Edge Function secrets** (`SLIPOK_API_KEY`, `SLIPOK_BRANCH_ID`) ในฝั่งเซิร์ฟเวอร์เท่านั้น ดู _Supabase setup_ ด้านล่าง

> 🧪 **โหมดเดโมแบบไม่มี backend:** ตั้ง `NEXT_PUBLIC_DATA_BACKEND=mock` แล้วรัน `npm run dev` ได้เลย — ทุกอย่างทำงานบน `localStorage` ไม่ต้องตั้ง Supabase

### Supabase setup (สำหรับ backend จริง)
1. สร้างโปรเจกต์ Supabase แล้วลง schema + RPC (ตาราง/ฟังก์ชันตามที่อธิบายใน [ARCHITECTURE.md](./ARCHITECTURE.md))

   > ⚠️ **Base schema ไม่อยู่ใน repo นี้** — โฟลเดอร์ [`supabase/migrations/`](./supabase/migrations) เป็น **changelog แบบต่อยอด (23 ไฟล์, `20260630_0001` → `20260708_0002`)** ครอบคลุมเฉพาะฟีเจอร์ช่วงหลัง (โค้ดส่วนลด → hardening → แข่งสด → roles → เพดานรางวัล → กันซ้ำข้ามบัญชี → ถอนตัว/เปลี่ยนคน) บน base schema ที่อยู่ในโปรเจกต์ Supabase จริงเท่านั้น การรัน `supabase db push` ใส่โปรเจกต์เปล่า **จะพัง** (FK/enum อ้างถึงตาราง/ไทป์ที่ยังไม่มี) — ถ้าต้องการสร้าง backend ขึ้นใหม่ ให้ dump base schema จากโปรเจกต์เดิมก่อน (`supabase db dump`) แล้วค่อย apply migrations เหล่านี้ทับ
2. ใส่ `NEXT_PUBLIC_SUPABASE_URL` และ `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` ใน `.env.local`
3. **ขั้นตอนต้องทำเองใน Dashboard (ตั้งผ่าน SQL ไม่ได้):** Authentication → Sign In / Providers → Email → ปิด **"Confirm email"** เพื่อให้สมัครแล้วล็อกอินได้ทันที (ถ้าเปิดไว้ แอปจะแสดงหน้า "ตรวจสอบอีเมล" ให้)
4. **ให้สิทธิ์แอดมินเป็นรายบัญชี** — สมัครบัญชีในแอปก่อน แล้วรัน SQL: `insert into account_roles(account_id, role) values ('<auth uid>', 'admin');` — ทุก RPC/Edge Function ฝั่งแอดมินตรวจ role นี้ฝั่งเซิร์ฟเวอร์ (ไม่มีรหัสผ่านกลางที่แชร์กัน); บัญชีเดียวถือได้หลาย role (`admin` + `judge`) ส่วน role กรรมการตั้งจากหน้าแอดมินผ่าน `admin_set_judge` ก็ได้
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
│  ├─ login/ signup/ forgot-password/ reset-password/   # auth
│  ├─ profile/ account/       # โปรไฟล์ตัวเอง / ผู้เล่นในความดูแล
│  ├─ register/               # ขั้นตอนสมัคร (applicant, categories, payment, success, expired)
│  ├─ my-registrations/       # ใบสมัครของฉัน (+ ถอนตัว/เปลี่ยนคน)
│  ├─ participants/           # รายชื่อผู้เข้าแข่งขัน
│  ├─ live/                   # หน้าผลสด raw HTML (+ snapshot/ = JSON)
│  ├─ judge/[key]/            # คอนโซลกรรมการ (raw HTML)
│  ├─ api/divisions/          # REST API สำหรับโปรแกรมจับคู่ MacMahon
│  ├─ admin/                  # หลังบ้าน (tournament, categories, registrations, withdrawals, live, judges, database, institutes, codes, reset)
│  ├─ providers.tsx           # I18n + AppStore + Auth + Toast providers
│  ├─ manifest.ts             # PWA manifest
│  └─ layout.tsx, globals.css
├─ components/
│  ├─ ui/                     # primitives (Button, Card, Sheet, form, Toast, feedback, …)
│  ├─ admin/                  # หน้าจอแอดมิน (+ ParticipantsExport, AdminLiveClient)
│  │  └─ rules/                # RulesBlockEditor, RulesTableEditor (บล็อกเนื้อหา/ตารางแก้ได้ในหน้า /admin/rules)
│  ├─ rules/                  # RulesBlocks — render บล็อกเนื้อหากฎ กติกาฝั่งสาธารณะ
│  ├─ auth/                   # AuthProvider, AccountMenu
│  ├─ register/               # RegisterFlowProvider, PersonFields, RankPicker, PromptPayQR, SlipUploader, …
│  ├─ registrations/          # WithdrawSheet, SwapSeatSheet (ถอนตัว/เปลี่ยนคน)
│  ├─ home/ participants/ account/
│  └─ PublicHeader.tsx, LanguageSwitcher.tsx, GlassDock.tsx, InfoPageClient.tsx
├─ lib/
│  ├─ data/                   # ★ DataLayer seam
│  │  ├─ types.ts             # interface DataLayer + โดเมนไทป์ทั้งหมด
│  │  ├─ index.ts             # สลับ backend ตาม NEXT_PUBLIC_DATA_BACKEND
│  │  ├─ SupabaseDataLayer.ts # impl จริง (Postgres/Auth/Storage/RPC)
│  │  ├─ MockDataLayer.ts     # impl localStorage (เดโม)
│  │  ├─ store.tsx            # React provider + useLiveQuery
│  │  └─ supabaseClient.ts
│  ├─ live/                   # โมดูลแข่งสด (client, serverData, apiShared, useLive) — อยู่นอก DataLayer seam
│  ├─ i18n/                   # ระบบสองภาษา (config, I18nProvider, dictionaries th/en)
│  ├─ rank.ts                 # แคตาล็อกระดับฝีมือ (power_level 0..22) + กฎ eligibility
│  ├─ age.ts                  # คำนวณอายุจากวันเกิด + กฎ eligibility ช่วงอายุ
│  ├─ provinces.ts            # รายชื่อ 77 จังหวัด (province picker)
│  ├─ promptpay.ts            # สร้าง Thai-QR payload จาก merchant QR (K SHOP) แบบฝังยอด
│  ├─ retry.ts                # auto-retry (backoff+jitter) สำหรับ read ตอนระบบแน่น
│  ├─ schedule.ts             # serialize/parse กำหนดการแบบจัดกลุ่มตามรุ่น
│  ├─ rules.ts                # serialize/parse กฎ กติกาแบบแบ่งหัวข้อ+บล็อกเนื้อหา
│  ├─ tournament-window.ts    # สถานะช่วงเปิด-ปิดรับสมัคร (before/open/closed)
│  ├─ export.ts               # สร้างไฟล์ export (CSV + MacMahon .txt)
│  ├─ go-database.ts          # parser DAN/KYU/AWARD (Excel + CSV/Google Sheets) + normalize ชื่อไทย
│  ├─ validation/schemas.ts   # zod schemas
│  ├─ admin-auth.ts           # UI hint ของ admin session (สิทธิ์จริงตรวจฝั่งเซิร์ฟเวอร์ด้วย role)
│  ├─ demo-seed.ts, image.ts, utils.ts
├─ supabase/
│  ├─ functions/
│  │  ├─ sync-go-database/     # Edge Function: ดึง Google Sheet (CSV) ฝั่ง server เลี่ยง CORS
│  │  ├─ verify-slip/          # Edge Function: ตรวจสลิปผ่าน SlipOK ฝั่ง server (มีโหมดเดโม)
│  │  └─ admin-reset/          # Edge Function: รีเซ็ตหลังจบงานแบบติ๊กเลือกกลุ่ม (ลบไฟล์ Storage ที่เกี่ยวข้องด้วย service role)
│  └─ migrations/              # SQL changelog (โค้ดส่วนลด → hardening → แข่งสด → roles → เพดานรางวัล → กันซ้ำข้ามบัญชี → ถอนตัว/เปลี่ยนคน → รีเซ็ตแบบติ๊กเลือก) — ⚠️ ไม่รวม base schema
├─ public/live-assets/        # JS/CSS ของหน้าผลสด + คอนโซลกรรมการ
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

สองระบบที่ตั้งใจออกแบบต่างจาก seam หลัก:

- **i18n** — ภาษา (`th`/`en`, ค่าเริ่มต้น `th`) เก็บในคุกกี้ `locale` และอ่านฝั่งเซิร์ฟเวอร์ใน root layout ตั้งแต่ first paint — `<html lang>` ตรงตั้งแต่แรก ไม่มีภาษากะพริบตอน hydrate
- **โมดูลแข่งสด** — จงใจอยู่ **นอก** DataLayer seam: เสิร์ฟเป็น raw HTML + อ่านตาราง `live_*` ตรง ๆ (public SELECT) + เขียนผ่าน RPC ตระกูล `live_*` เพื่อคงความเข้ากันได้กับโปรแกรมจับคู่ MacMahon และ client รุ่นเก่า (ดู section ถัดไป)

👉 รายละเอียดเต็ม (ไดอะแกรม seam, flow การจอง, RLS/ความปลอดภัย) อยู่ใน **[ARCHITECTURE.md](./ARCHITECTURE.md)**

---

## ระบบผลสด & กรรมการ (Live & Judge)

โมดูลรายงานผลการแข่งขันสดใช้ backend Supabase เดียวกัน แต่แยกจากแอปสมัครโดยตั้งใจ — เสิร์ฟเป็น raw HTML + vanilla JS (assets ใน `public/live-assets/`) ให้โครง API เข้ากันได้กับโปรแกรมจับคู่ **MacMahon-TESUJI (`.jar`)** และ client รุ่นเดิม:

- 📺 **`/live`** — หน้าผลสดสาธารณะ (ไม่ต้องล็อกอิน): ผลการแข่งเรียลไทม์, ตารางคะแนน, ฟีเจอร์ "ติดตามนักเรียนของฉัน"; ส่วน `/live/snapshot` ให้ JSON snapshot ของสถานะทั้งหมดสำหรับ polling
- 🧑‍⚖️ **`/judge/[key]`** — คอนโซลกรรมการ: กรอกผลแข่ง, เช็คอิน, จับคู่มือ (force pairing) — `key` คือ live token (ตรวจด้วย `live_check_token`) และผู้ใช้ต้องล็อกอินด้วยบัญชีที่มี role `judge` ด้วย
- 🔌 **`/api/divisions/*`** — REST API (divisions / rounds / matches / result / standings / checkin / force) สำหรับให้โปรแกรมจับคู่อ่าน-เขียนโดยตรง
- 🎛️ **`/admin/live`** — หน้าควบคุมฝั่งแอดมิน: จัดการรุ่น/ข้อมูลสด, คัดลอกลิงก์กรรมการ + token, danger zone ล้างข้อมูลสด (`live_clear_all`)
- 🗄️ **Data model:** `live_division` / `live_match` / `live_standing` / `live_config` — เปิดอ่านสาธารณะ (public SELECT + Supabase Realtime) แต่ **เขียนได้ผ่าน RPC ตระกูล `live_*` เท่านั้น** ซึ่ง gate ด้วย `_is_live_writer` (เป็นแอดมิน หรือถือ live token)

---

## Backend (Supabase)

- **ตารางหลัก:** `tournament` (กำหนดการเก็บเป็น JSON ใน `schedule_text`, กฎ กติกาเก็บเป็น JSON แบ่งหัวข้อใน `rules_text`), `category` (ตัวนับ `seats_taken` + เช็คห้ามจองเกิน + `combinable_category_ids`), `registration_batch` (มี `slip_verify_status` / `slip_verify_data` / `slip_verified_at` + `promo_code` / `discount_thb`), `registration_seat` (มี `withdrawn_at` เมื่อถอนตัว — แถวไม่ถูกลบ), `seat_hold`, `seat_hold_line`, `profile`, `managed_player`, `app_config`, `go_player_database` (คลังหลักฐานดิบ) + `go_person` (ทะเบียนบุคคล id คงที่ + power_level resolve แล้ว ที่ `profile`/`managed_player` ลิงก์ผ่าน `person_id`), `award_limit_exemption` (รายชื่อยกเว้นเพดานรางวัล 1 คิว), `go_institute` (มี `keywords[]` = คำค้น/alias), `institute_merge` (ประวัติการรวมสถาบันแบบ reversible), `promo_code` / `promo_redemption` (โค้ดส่วนลด/สมัครฟรี ต่อรายการแข่ง + ประวัติการใช้), `seat_withdrawal` (snapshot ผู้ถอนตัว + บัญชีรับเงินคืน + `refund_status`), `account_roles` (role `admin`/`judge` ต่อบัญชี — composite PK ถือหลาย role ได้), `live_division` / `live_match` / `live_standing` / `live_config` (ระบบแข่งสด)
- **ฟิลด์ผู้สมัคร (PII):** `profile` / `managed_player` / `registration_seat` มี `province`, `institute_id` (→ `go_institute`), `institute_name`, `pdpa_consent`, `pdpa_consent_at` — `reserve_seats` snapshot ค่าเหล่านี้จากเรคคอร์ดต้นทางลงที่นั่ง
- **RPC สำคัญ (จัดกลุ่ม):**

  | กลุ่ม | RPC | หน้าที่ |
  |---|---|---|
  | จอง/สมัคร | `reserve_seats` | จองที่นั่ง all-or-nothing + hold 15 นาที; กันโกงรุ่นทั้งระดับฝีมือ/อายุ, กันสมัครซ้ำ **ข้ามบัญชีด้วยชื่อไทย normalize**, เช็ครุ่นควบ, เพดานรางวัล 1 คิว, snapshot จังหวัด/สถาบัน/PDPA |
  | | `submit_registration` | ส่งใบสมัคร — consume hold + นับโค้ดส่วนลดแบบ atomic; ยอด 0 บาท → ยืนยันอัตโนมัติ |
  | | `get_batch_public` / `release_batch` | อ่าน/ยกเลิกใบสมัครของตัวเอง (ตรวจความเป็นเจ้าของด้วย `auth.uid()`) |
  | | `release_expired_holds` | คืนที่นั่งหมดเวลา — pg_cron ทุกนาที + lazy ตอนอ่าน |
  | | `list_participants` | รายชื่อผู้เข้าแข่งขันสาธารณะ (ไม่รวมผู้ถอนตัว) |
  | ถอนตัว/เปลี่ยนคน | `withdraw_seat` / `swap_seat` | เจ้าของถอนผู้เล่นรายที่นั่ง (เก็บบัญชีรับเงินคืน; ที่นั่งคืนโควตา แต่ยอดใบไม่เปลี่ยน) / เปลี่ยนคน-ย้ายรุ่นค่าสมัครเท่ากัน (ตรวจสิทธิ์ใหม่ครบชุดฝั่งเซิร์ฟเวอร์) |
  | | `admin_list_withdrawals` / `admin_set_withdrawal_status` | แอดมินดูรายการถอนตัว + ตั้งสถานะคืนเงิน `pending`/`refunded`/`denied` — ตั้ง `refunded` ต้องแนบสลิปหลักฐาน (บังคับฝั่งเซิร์ฟเวอร์) และล็อกถาวร; ยอดที่คืนแล้วถูกหักจากรายได้บนแดชบอร์ด |
  | โค้ดส่วนลด | `apply_promo` | ผู้สมัครใส่โค้ด → คิดส่วนลดลง `total_amount_thb` ฝั่งเซิร์ฟเวอร์; นับการใช้ตอน `submit_registration`, ฟรี → ยืนยันอัตโนมัติ |
  | | `admin_upsert_promo` / `admin_delete_promo` / `admin_list_promos` | จัดการโค้ดต่อรายการแข่ง |
  | ฐานฝีมือ + เพดานรางวัล | `search_go_person` | ค้นระดับฝีมือจากชื่อ (exact → normalized → fuzzy) + ผูกกับแถวใน **ทะเบียนบุคคล `go_person`** ที่ใช้ลิงก์ระดับ |
  | | `admin_import_rank_database` | นำเข้า/แทนที่ฐาน DAN/KYU/AWARD ทีละแหล่ง **+ รีเฟรชทะเบียน + ซิงก์ระดับผู้ใช้ที่ลิงก์ไว้ทุกคน** ในทรานแซกชันเดียว |
  | | `admin_sync_player_ranks` / `admin_list_rank_conflicts` | ซิงก์ระดับผู้ใช้กับฐานด้วยตัวเอง / ลิสต์ที่นั่งที่ระดับปัจจุบันหลุดเกณฑ์รุ่น (snapshot ที่นั่งไม่ถูกแก้ย้อนหลัง) |
  | | `award_limit_status` | เช็กเพดานรางวัล 1 คิว — ใช้ทั้งด่านใน `reserve_seats` และคำเตือนฝั่ง client |
  | | `admin_add_award_exemption` / `admin_remove_award_exemption` / `admin_list_award_exemptions` | จัดการรายชื่อยกเว้นเพดานรางวัล |
  | สถาบัน | `find_or_create_institute` | พิมพ์เพิ่มสถาบันใหม่จากฟอร์มสมัคร |
  | | `upsert_institute` / `delete_institute` / `purge_institute` / `admin_list_institutes` / `admin_institute_counts` | จัดการสถาบัน + คำค้น + นับผู้สมัครต่อสถาบัน |
  | | `merge_institute` / `unmerge_institute` / `list_institute_merges` | รวมสถาบันซ้ำ + แยกคืน (เก็บประวัติ) |
  | ตรวจใบสมัคร | `admin_get_batch` / `admin_update_seat` / `admin_delete_seat` / `admin_delete_batch` | ดู/แก้ไข/ลบผู้สมัครรายคนหรือทั้งใบ (ปรับที่นั่ง/ยอดเงินอัตโนมัติ) |
  | จัดการงาน/รีเซ็ต | `admin_selective_reset` | รีเซ็ตหลังจบงานแบบติ๊กเลือกกลุ่ม (`p_targets[]`) — ตรวจ dependency + คำยืนยันซ้ำฝั่งเซิร์ฟเวอร์; เก็บบัญชีผู้เรียกไว้เสมอ (`p_keep_uid`) เรียกผ่าน Edge Function `admin-reset` เท่านั้น (service role) |
  | Roles | `is_admin_me` | เช็คว่า session ปัจจุบันมี role `admin` (ใช้ gate UI ฝั่งหน้าบ้าน) |
  | | `admin_set_judge` / `admin_list_judges` | แต่งตั้ง/ลิสต์กรรมการ (role `judge`) |
  | Live/Judge | ตระกูล `live_*` (`live_upsert_division`, `live_replace_round`, `live_submit_result`, `live_set_standings`, `live_set_force`, `live_toggle_checkin`, `live_set_config`, `live_clear_all`, …) | เขียนข้อมูลแข่งสดทั้งหมด — gate ด้วย `_is_live_writer` (แอดมิน หรือ live token) |
  | | `live_get_token` / `judge_get_token` / `live_check_token` | อ่าน token (แอดมิน/กรรมการ) + ตรวจ token ของคอนโซลกรรมการ |

  และ RPC ฝั่งแอดมินสำหรับจัดการรายการแข่ง/รุ่น/ใบสมัคร (`upsert_tournament`, `upsert_category`, `confirm_registration`, `reject_registration`, ฯลฯ — อยู่ใน base schema)
- **Edge Functions:** `verify-slip` (ตรวจสลิปผ่าน SlipOK ฝั่ง server — มีโหมดเดโม + action `view` คืน **signed URL** อายุสั้นให้แอดมินดูสลิป; อ่านสลิปจาก storage ของตัวเองเท่านั้น = กัน SSRF), `sync-go-database` (ดึง Google Sheet CSV เลี่ยง CORS — จำกัดปลายทางเฉพาะโฮสต์ Google + ตามรีไดเรกต์แบบตรวจโฮสต์ทุก hop = กัน SSRF), `admin-reset` (รีเซ็ตหลังจบงาน — ตรวจ role แอดมินจาก JWT ผู้เรียก แล้วเรียก RPC `admin_selective_reset` ด้วย service role + ลบไฟล์ที่เกี่ยวข้องใน Storage เช่นสลิป/แบนเนอร์ตามกลุ่มที่เลือก)
- **ความปลอดภัย:** RLS เปิดสิทธิ์เฉพาะเจ้าของบนตาราง PII (`profile`/`managed_player`); anon/ผู้ใช้อ่านได้แค่ `tournament`/`category`/`go_institute` และตาราง `live_*` (เปิดอ่านสาธารณะสำหรับหน้า `/live`); ฐานข้อมูลระดับฝีมือ `go_player_database` + ทะเบียนบุคคล `go_person` **เข้าถึงผ่าน RPC เท่านั้น** (RLS เปิด ไม่มี policy = ปฏิเสธ; ไม่เปิดอ่านทั้งตาราง); RPC ฝั่งผู้ใช้ที่รับ batch id (`get_batch_public` / `submit_registration` / `release_batch` / `apply_promo` / `withdraw_seat` / `swap_seat`) **ตรวจความเป็นเจ้าของด้วย `auth.uid()`** ทุกตัว (แอดมินอ่านใบสมัครผ่าน `admin_get_batch` แยก); ผู้สมัครกรอกฟอร์มถูก **ตรวจซ้ำฝั่งเซิร์ฟเวอร์** ใน `reserve_seats` (กันเลี่ยงฟอร์ม); RPC/Edge Function ฝั่งแอดมินทุกตัวตรวจ `_is_admin()` = ผู้เรียกต้องล็อกอินด้วยบัญชีที่มี role `admin` ใน `account_roles` (**ไม่มี secret ฝังในเบราว์เซอร์** — flag "admin" ใน sessionStorage เป็นแค่ UI hint, หน้าบ้าน gate ด้วย `is_admin_me()`); ฝั่งแข่งสดเขียนผ่าน `_is_live_writer` (แอดมิน หรือ live token); คีย์ SlipOK อยู่ใน Edge Function secrets ไม่หลุดมาเบราว์เซอร์; ตั้ง **security headers + CSP** ใน `next.config.mjs`
- **Storage:** bucket สาธารณะ `tesuji` สำหรับแบนเนอร์ (จำกัดชนิด/ขนาดไฟล์); **สลิปการชำระเงินอยู่ในบัคเก็ตส่วนตัว `tesuji-slips`** ไม่เปิดสาธารณะ — แอดมินดูผ่าน signed URL อายุสั้น, `verify-slip` อ่านด้วย service role

---

## เอกสารเพิ่มเติม (Documentation)

- 📐 **[ARCHITECTURE.md](./ARCHITECTURE.md)** — DataLayer seam, โมเดลระดับฝีมือ, โมเดลความปลอดภัย, โมดูลแข่งสด, backend Supabase แบบละเอียด
- 📊 **[docs/rank-databases.md](./docs/rank-databases.md)** — สเปกไฟล์ Excel ทั้ง 3 ฐาน (DAN/KYU/AWARD) + กฎแปลงเป็น power_level + การจับคู่ชื่อ
- 🤝 **[CONTRIBUTING.md](./CONTRIBUTING.md)** — แนวทางพัฒนา/ส่ง PR

> **หมายเหตุความปลอดภัย:** สิทธิ์แอดมิน/กรรมการผูกกับบัญชี Supabase Auth เป็นรายบัญชี (ตาราง `account_roles`) และถูกตรวจ **ฝั่งเซิร์ฟเวอร์** ใน RPC/Edge Function ทุกตัวผ่าน `_is_admin()` — ไม่มี secret ใดฝังใน bundle ฝั่งเบราว์เซอร์ (flag "admin" ใน sessionStorage เป็นแค่ตัวช่วยแสดงผล ไม่มีผลต่อสิทธิ์) การให้สิทธิ์ทำด้วย SQL ตามขั้นตอนใน [Supabase setup](#เริ่มต้นใช้งาน-getting-started)

---

## License

[MIT](./LICENSE) © 2026 nackkrmt

<sub>สร้างด้วย ❤️ สำหรับชุมชนหมากล้อมไทย · Built with Next.js + Supabase</sub>
