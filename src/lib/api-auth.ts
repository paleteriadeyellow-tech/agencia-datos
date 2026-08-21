import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { isAgencySlug, type AgencySlug } from "@/lib/agencies";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/permissions";
import {
  applyViewAs,
  getScope,
  userIdFromToken,
  type ManagerScope,
} from "@/lib/creator-scope";
import { parseViewAsId, VIEW_AS_COOKIE } from "@/lib/view-as";

function viewAsIdFromRequest(req: NextRequest) {
  return parseViewAsId(
    req.cookies.get(VIEW_AS_COOKIE)?.value ?? req.headers.get("x-view-as")
  );
}

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
      isAdmin: false,
      viewingAs: null as null,
    };
  }
  const agencySlug = token.agencySlug as string | undefined;
  if (!agencySlug || !isAgencySlug(agencySlug)) {
    return {
      error: NextResponse.json({ error: "Sesión sin agencia" }, { status: 403 }),
      token: null as null,
      agencySlug: null as null,
      scope: null as null,
      isAdmin: false,
      viewingAs: null as null,
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

  const isAdminUser = isAdmin(token.role as string | undefined);

  let scope: ManagerScope;
  try {
    scope = getScope(token);
  } catch {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      token: null as null,
      agencySlug: null as null,
      scope: null as null,
      isAdmin: false,
      viewingAs: null as null,
    };
  }

  const viewed = await applyViewAs(
    scope,
    agencySlug,
    viewAsIdFromRequest(req)
  );

  return {
    error: null as null,
    token,
    agencySlug: agencySlug as AgencySlug,
    scope: viewed.scope,
    isAdmin: isAdminUser,
    viewingAs: viewed.viewingAs,
  };
}
