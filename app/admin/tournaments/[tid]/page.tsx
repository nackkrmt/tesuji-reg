import AdminTournamentForm from "@/components/admin/AdminTournamentForm";

export default async function AdminEditTournamentPage({
  params,
}: {
  params: Promise<{ tid: string }>;
}) {
  const { tid } = await params;
  return <AdminTournamentForm tournamentId={tid} />;
}
