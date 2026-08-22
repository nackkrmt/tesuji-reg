import { redirect } from "next/navigation";

export default function RegisterIndex({ params }: { params: { tid: string } }) {
  redirect(`/t/${params.tid}/register/applicant`);
}
