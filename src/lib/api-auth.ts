import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { isAgencySlug, type AgencySlug } from "@/lib/agencies";

export async function requireApiAuth(req: NextRequest) {
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });
  if (!token?.id) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      token: null as null,
      agencySlug: null as null,
    };
  }
  const agencySlug = token.agencySlug as string | undefined;
  if (!agencySlug || !isAgencySlug(agencySlug)) {
    return {
      error: NextResponse.json({ error: "Sesión sin agencia" }, { status: 403 }),
      token: null as null,
      agencySlug: null as null,
    };
  }
  return {
    error: null as null,
    token,
    agencySlug: agencySlug as AgencySlug,
  };
}
