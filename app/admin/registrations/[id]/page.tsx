import RegistrationDetail from "@/components/admin/RegistrationDetail";

export default async function AdminRegistrationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <RegistrationDetail batchId={id} />;
}
