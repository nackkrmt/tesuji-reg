import ParticipantsExport from "@/components/admin/ParticipantsExport";
import RegistrationReviewList from "@/components/admin/RegistrationReviewList";

export default function AdminRegistrationsPage() {
  return (
    <div className="space-y-5">
      <ParticipantsExport />
      <RegistrationReviewList />
    </div>
  );
}
