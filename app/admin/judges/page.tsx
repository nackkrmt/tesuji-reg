"use client";

import { PageHeader } from "@/components/ui/PageHeader";
import { JudgeManager } from "@/components/admin/JudgeManager";

export default function AdminJudgesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="จัดการกรรมการ"
        description="ตั้งบัญชีผู้ใช้เป็นกรรมการของรายการที่เลือกอยู่ และกำหนดรุ่นเริ่มต้นของแต่ละคน — กรรมการแต่ละรายการแยกกัน"
      />
      <JudgeManager />
    </div>
  );
}
