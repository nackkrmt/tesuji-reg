import { redirect } from "next/navigation";

export default async function RegisterIndex({
  params,
}: {
  params: Promise<{ tid: string }>;
}) {
  const { tid } = await params;
  redirect(`/t/${tid}/register/applicant`);
}
