"use client";

import { PageHeader } from "@/components/ui/PageHeader";
import AdminRulesForm from "@/components/admin/AdminRulesForm";

export default function AdminRulesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="กฎ กติกา"
        description="จัดการเนื้อหากฎ กติกาที่แสดงในหน้า /rules — เพิ่มหัวข้อแล้ววางเนื้อหาบรรทัดละข้อ (เว้นแท็บ/เลขซ้อนชั้นเพื่อจัดชั้นย่อย)"
      />
      <AdminRulesForm />
    </div>
  );
}
