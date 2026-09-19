import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { isAgencySlug, AGENCIES } from "@/lib/agencies";
import { signDesktopToken } from "@/lib/desktop-auth";

export const dynamic = "force-dynamic";

/** Preflight CORS para la app Electron. */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers":
        "Authorization, Content-Type, X-View-As, X-Skip-View-As",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    agencies: Object.values(AGENCIES).map((a) => ({
      slug: a.slug,
      name: a.shortName,
    })),
  });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const email = String((body as { email?: string })?.email || "")
    .toLowerCase()
    .trim();
  const password = String((body as { password?: string })?.password || "");
  const agencySlug = String(
    (body as { agencySlug?: string })?.agencySlug || ""
  ).trim();

  if (!email || !password || !agencySlug) {
    return NextResponse.json(
      { error: "Email, contraseña y agencia son obligatorios." },
      { status: 400 }
    );
  }
  if (!isAgencySlug(agencySlug)) {
    return NextResponse.json({ error: "Agencia no válida." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { agencySlug_email: { agencySlug, email } },
  });
  if (!user) {
    return NextResponse.json(
      { error: "Credenciales incorrectas." },
      { status: 401 }
    );
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return NextResponse.json(
      { error: "Credenciales incorrectas." },
      { status: 401 }
    );
  }

  const accessToken = await signDesktopToken({
    id: user.id,
    role: user.role,
    agencySlug: user.agencySlug,
    name: user.name,
    email: user.email,
  });

  return NextResponse.json({
    accessToken,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      agencySlug: user.agencySlug,
    },
  });
}
