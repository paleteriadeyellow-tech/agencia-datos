import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import { canAccessPath } from "@/lib/permissions";

export default withAuth(
  function middleware(req) {
    const role = req.nextauth.token?.role as string | undefined;
    const path = req.nextUrl.pathname;

    if (!canAccessPath(role, path)) {
      const url = req.nextUrl.clone();
      url.pathname = "/dashboard";
      url.search = "";
      return NextResponse.redirect(url);
    }

    return NextResponse.next();
  },
  {
    pages: {
      signIn: "/login",
    },
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
);

export const config = {
  matcher: [
    "/dashboard",
    "/dashboard/:path*",
    "/creadores",
    "/creadores/:path*",
    "/metricas",
    "/metricas/:path*",
    "/tareas",
    "/tareas/:path*",
    "/campanas",
    "/campanas/:path*",
    "/finanzas",
    "/finanzas/:path*",
    "/bonos",
    "/bonos/:path*",
    "/contratos",
    "/contratos/:path*",
    "/managers",
    "/managers/:path*",
    "/control-diamantes",
    "/control-diamantes/:path*",
    "/envio-kpi",
    "/envio-kpi/:path*",
    "/mensajes-wa",
    "/mensajes-wa/:path*",
  ],
};
