import RegistrationDetail from "@/components/admin/RegistrationDetail";

export default function AdminRegistrationDetailPage({
  params,
}: {
  params: { id: string };
}) {
  return <RegistrationDetail batchId={params.id} />;
}
