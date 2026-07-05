import ParticipantsExport from "@/components/admin/ParticipantsExport";
import RegistrationReviewList from "@/components/admin/RegistrationReviewList";
import { PageHeader } from "@/components/ui/PageHeader";

export default function AdminRegistrationsPage() {
  return (
    <>
      <PageHeader
        title="ใบสมัคร"
        description="ตรวจสอบ ยืนยัน หรือปฏิเสธการสมัคร และส่งออกรายชื่อผู้เข้าแข่งขัน"
      />
      <div className="space-y-5">
        <ParticipantsExport />
        <RegistrationReviewList />
      </div>
    </>
  );
}
