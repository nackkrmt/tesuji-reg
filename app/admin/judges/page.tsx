"use client";

import { PageHeader } from "@/components/ui/PageHeader";
import { JudgeManager } from "@/components/admin/JudgeManager";

export default function AdminJudgesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="จัดการกรรมการ"
        description="ตั้งบัญชีผู้ใช้เป็นกรรมการเพื่อกรอกผลแข่ง และกำหนดรุ่นเริ่มต้นของแต่ละคน"
      />
      <JudgeManager />
    </div>
  );
}
