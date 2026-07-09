// Client wrapper + target metadata for the `admin-reset` edge function — the
// checklist reset behind the admin Danger Zone (/admin/reset). The edge
// function authenticates the caller's admin role from their JWT (attached
// automatically by functions.invoke), so there's no secret to pass here.

import { getSupabase } from "@/lib/data/supabaseClient";

/** Type this exactly to confirm the wipe. Also enforced by the edge function
 *  and the admin_selective_reset RPC. */
export const RESET_PHRASE = "ล้างข้อมูล";

export type ResetTargetKey =
  | "registrations"
  | "promo_codes"
  | "accounts"
  | "institutes"
  | "player_db"
  | "live"
  | "categories"
  | "tournament";

export interface ResetTarget {
  key: ResetTargetKey;
  label: string;
  desc: string;
  /** Groups that must be wiped together with this one (UI auto-ticks them;
   *  the RPC re-validates and refuses if they're missing). */
  deps: ResetTargetKey[];
}

/** Display order: mild → nuclear. Keys/deps mirror admin_selective_reset. */
export const RESET_TARGETS: ResetTarget[] = [
  {
    key: "registrations",
    label: "ใบสมัคร + สลิปทั้งหมด",
    desc: "ลบใบสมัคร ผู้สมัคร การจองที่นั่ง คำขอถอนตัว และไฟล์สลิปทั้งหมด · คืนที่นั่งทุกรุ่นเป็น 0",
    deps: [],
  },
  {
    key: "promo_codes",
    label: "โปรโมโค้ด",
    desc: "ลบโค้ดส่วนลดทั้งหมด (ถ้าไม่ติ๊ก โค้ดยังอยู่และยอดใช้ถูกรีเซ็ตเมื่อล้างใบสมัคร)",
    deps: [],
  },
  {
    key: "accounts",
    label: "บัญชีผู้ใช้ทั้งหมด (ยกเว้นบัญชีของคุณ)",
    desc: "ลบบัญชี โปรไฟล์ และผู้เล่นในสังกัดของบัญชีอื่นทั้งหมด — บัญชีคุณ + สังกัดของคุณถูกเก็บไว้",
    deps: [],
  },
  {
    key: "institutes",
    label: "สถาบัน",
    desc: "ลบรายชื่อสถาบันทั้งหมด (ชื่อสถาบันที่บันทึกเป็นข้อความในโปรไฟล์/ใบสมัครยังอยู่)",
    deps: [],
  },
  {
    key: "player_db",
    label: "ฐานข้อมูลนักกีฬา (dan/kyu/award)",
    desc: "ลบฐานข้อมูลที่ sync มา + รายชื่อยกเว้น award — ระดับฝีมือที่ยืนยันจากฐานนี้กลับเป็นรอตรวจ · ดึงใหม่ได้ที่เมนู “ฐานข้อมูล”",
    deps: [],
  },
  {
    key: "live",
    label: "ข้อมูลแข่งสด",
    desc: "ลบรุ่นแข่ง คู่จับ ผล ตารางคะแนน และประกาศทั้งหมด",
    deps: [],
  },
  {
    key: "categories",
    label: "รุ่นทั้งหมด",
    desc: "ลบรุ่นการแข่งขันทุกรุ่น (ต้องล้างใบสมัครด้วย — ติ๊กให้อัตโนมัติ)",
    deps: ["registrations"],
  },
  {
    key: "tournament",
    label: "รายการแข่งทั้งหมด",
    desc: "ลบตัวรายการแข่ง + ไฟล์แบนเนอร์/กติกา เพื่อเริ่มใหม่หมด (ติ๊กใบสมัคร/รุ่น/โปรโมโค้ดให้อัตโนมัติ)",
    deps: ["registrations", "categories", "promo_codes"],
  },
];

export interface SelectiveResetResult {
  /** Headline rows removed per wiped group (key present only when ticked). */
  counts: Partial<Record<ResetTargetKey, number>>;
  slips_deleted: number;
  slip_error: string | null;
  assets_deleted: number;
  asset_error: string | null;
}

/** Run the selective reset. Resolves with per-group counts, or throws with a
 *  stable error code (CONFIRM_MISMATCH / UNAUTHORIZED / …) on failure. */
export async function selectiveReset(
  confirm: string,
  targets: ResetTargetKey[],
): Promise<SelectiveResetResult> {
  const { data, error } = await getSupabase().functions.invoke("admin-reset", {
    body: { confirm, targets },
  });
  if (error) {
    // non-2xx → FunctionsHttpError with a generic message; the real code
    // ({ error: "UNAUTHORIZED" | … }) is in the response body on error.context.
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      const body = (await ctx.json().catch(() => null)) as { error?: string } | null;
      if (body?.error) throw new Error(body.error);
    }
    throw new Error(error.message || "RESET_FAILED");
  }
  const d = (data ?? {}) as {
    ok?: boolean;
    error?: string;
    result?: SelectiveResetResult;
  };
  if (!d.ok) throw new Error(d.error || "RESET_FAILED");
  return (
    d.result ?? {
      counts: {},
      slips_deleted: 0,
      slip_error: null,
      assets_deleted: 0,
      asset_error: null,
    }
  );
}
