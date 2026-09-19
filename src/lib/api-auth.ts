import { NextRequest, NextResponse } from "next/server";
import { getToken, type JWT } from "next-auth/jwt";
import { isAgencySlug, type AgencySlug } from "@/lib/agencies";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/permissions";
import {
  applyViewAs,
  getScope,
  userIdFromToken,
  type ManagerScope,
} from "@/lib/creator-scope";
import {
  desktopClaimsToJwt,
  verifyDesktopToken,
} from "@/lib/desktop-auth";
import { parseViewAsId, VIEW_AS_COOKIE } from "@/lib/view-as";

function viewAsIdFromRequest(req: NextRequest) {
  return parseViewAsId(
    req.cookies.get(VIEW_AS_COOKIE)?.value ?? req.headers.get("x-view-as")
  );
}

async function resolveToken(req: NextRequest): Promise<JWT | null> {
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    const raw = auth.slice(7).trim();
    if (raw) {
      const claims = await verifyDesktopToken(raw);
      if (claims) return desktopClaimsToJwt(claims);
    }
  }
  return getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });
}

export async function requireApiAuth(req: NextRequest) {
  const token = await resolveToken(req);
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

  const skipViewAs = req.headers.get("x-skip-view-as") === "1";
  const viewed =
    skipViewAs && isAdminUser
      ? { scope, viewingAs: null as { id: string; name: string } | null }
      : await applyViewAs(scope, agencySlug, viewAsIdFromRequest(req));

  return {
    error: null as null,
    token,
    agencySlug: agencySlug as AgencySlug,
    scope: viewed.scope,
    isAdmin: isAdminUser,
    viewingAs: viewed.viewingAs,
  };
}
