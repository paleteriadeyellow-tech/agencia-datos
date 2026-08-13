import { notFound } from "next/navigation";
import { getAgency, isAgencySlug } from "@/lib/agencies";

export default async function AgencyLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ agency: string }>;
}) {
  const { agency } = await params;
  if (!isAgencySlug(agency) || !getAgency(agency)) notFound();
  return children;
}
