import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import "@/lib/ensure-auth-url";
import { isAgencySlug } from "@/lib/agencies";
import { canAccessPath } from "@/lib/permissions";

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const match = path.match(/^\/a\/([^/]+)(\/.*)?$/);
  if (!match) return NextResponse.next();

  const agency = match[1];
  const rest = match[2] || "";

  if (!isAgencySlug(agency)) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  if (rest === "/login" || rest === "/register" || rest.startsWith("/login/") || rest.startsWith("/register/")) {
    return NextResponse.next();
  }

  if (!rest || rest === "/") {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    const dest =
      token?.agencySlug === agency
        ? `/a/${agency}/dashboard`
        : `/a/${agency}/login`;
    return NextResponse.redirect(new URL(dest, req.url));
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return NextResponse.redirect(new URL(`/a/${agency}/login`, req.url));
  }
  if (token.agencySlug !== agency) {
    return NextResponse.redirect(new URL(`/a/${agency}/login`, req.url));
  }

  if (!canAccessPath(token.role as string, rest)) {
    return NextResponse.redirect(new URL(`/a/${agency}/dashboard`, req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/a/:agency/:path*"],
};
