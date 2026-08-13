import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import type { AgencySlug } from "@/lib/agencies";
import { isAgencySlug } from "@/lib/agencies";

export async function requireAgencySession(expectedAgency?: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { error: "No autenticado.", session: null as null, agencySlug: null as null };
  }
  const agencySlug = session.user.agencySlug;
  if (!agencySlug || !isAgencySlug(agencySlug)) {
    return { error: "Sesión sin agencia.", session: null as null, agencySlug: null as null };
  }
  if (expectedAgency && agencySlug !== expectedAgency) {
    return {
      error: "Esta sesión pertenece a otra agencia.",
      session: null as null,
      agencySlug: null as null,
    };
  }
  return {
    error: null as null,
    session,
    agencySlug: agencySlug as AgencySlug,
  };
}
