import type { Metadata } from "next";
import ResultsHubClient from "@/components/results/ResultsHubClient";
import { serverDictionary } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await serverDictionary();
  return { title: t.meta.resultsTitle, description: t.meta.resultsDescription };
}

export default function ResultsPage() {
  return <ResultsHubClient />;
}
