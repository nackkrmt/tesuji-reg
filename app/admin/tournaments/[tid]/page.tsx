import AdminTournamentForm from "@/components/admin/AdminTournamentForm";

export default function AdminEditTournamentPage({
  params,
}: {
  params: { tid: string };
}) {
  return <AdminTournamentForm tournamentId={params.tid} />;
}
