import { JudgeClient } from "@/components/live/JudgeClient";

// Secret-link judge console. The [key] segment is the live_token — an
// unguessable value that authorizes result / check-in writes. There is no
// link to this route anywhere in the app; judges are handed the URL directly.
export default function JudgePage({ params }: { params: { key: string } }) {
  return <JudgeClient secret={params.key} />;
}
