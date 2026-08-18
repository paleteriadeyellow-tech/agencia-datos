import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { isAgencySlug, type AgencySlug } from "@/lib/agencies";
import { prisma } from "@/lib/prisma";
import {
  getScope,
  userIdFromToken,
  type ManagerScope,
} from "@/lib/creator-scope";

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
      scope: null as null,
    };
  }
  const agencySlug = token.agencySlug as string | undefined;
  if (!agencySlug || !isAgencySlug(agencySlug)) {
    return {
      error: NextResponse.json({ error: "Sesión sin agencia" }, { status: 403 }),
      token: null as null,
      agencySlug: null as null,
      scope: null as null,
    };
  }

  const userId = userIdFromToken(token);
  if (userId) {
    const dbUser = await prisma.user.findFirst({
      where: { id: userId, agencySlug },
      select: { role: true },
    });
    if (dbUser) token.role = dbUser.role;
  }

  let scope: ManagerScope;
  try {
    scope = getScope(token);
  } catch {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      token: null as null,
      agencySlug: null as null,
      scope: null as null,
    };
  }

  return {
    error: null as null,
    token,
    agencySlug: agencySlug as AgencySlug,
    scope,
  };
}
