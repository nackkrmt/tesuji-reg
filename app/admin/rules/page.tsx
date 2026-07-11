"use client";

import { PageHeader } from "@/components/ui/PageHeader";
import AdminRulesForm from "@/components/admin/AdminRulesForm";

export default function AdminRulesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="กฎ กติกา"
        description="จัดการเนื้อหากฎ กติกาที่แสดงในหน้า /rules — เพิ่มหัวข้อแล้วต่อบล็อกเนื้อหา (หัวข้อ/ข้อความ/รายการ/ตาราง/เส้นคั่น/หมายเหตุ) เรียงลำดับตามต้องการ"
      />
      <AdminRulesForm />
    </div>
  );
}
