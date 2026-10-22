"use client";

import { PageHeader } from "@/components/ui/PageHeader";
import { SubAdminManager } from "@/components/admin/SubAdminManager";

export default function AdminSubAdminsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="ผู้ช่วยแอดมิน"
        description="ตั้งบัญชีผู้ใช้เป็นผู้ช่วยแอดมินของรายการที่เลือกอยู่ — ดูแลใบสมัคร รุ่น กฎ โค้ด ผลแข่งสด และกรรมการของรายการนี้ได้ แต่ไม่เห็นข้อมูลกลางและรีเซ็ต"
      />
      <SubAdminManager />
    </div>
  );
}
