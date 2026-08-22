import { TournamentProvider } from "@/components/tournament/TournamentProvider";

export default function TournamentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { tid: string };
}) {
  return <TournamentProvider tid={params.tid}>{children}</TournamentProvider>;
}
