import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { requireApiAuth } from "@/lib/api-auth";
import { creatorWhere } from "@/lib/creator-scope";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (auth.error) return auth.error;
  const { agencySlug, scope } = auth;
  const scopeFilter = creatorWhere(scope, agencySlug);

  const { searchParams } = req.nextUrl;
  const q = searchParams.get("q") ?? undefined;
  const niche = searchParams.get("niche") ?? undefined;
  const status = searchParams.get("status") ?? undefined;
  const group = searchParams.get("group") ?? undefined;

  const creators = await prisma.creator.findMany({
    where: {
      agencySlug,
      ...scopeFilter,
      AND: [
        q
          ? {
              OR: [
                { name: { contains: q } },
                { phone: { contains: q } },
                { tiktokUser: { contains: q } },
              ],
            }
          : {},
        niche ? { niche } : {},
        status ? { status } : {},
        group ? { groupName: group } : {},
      ],
    },
    orderBy: { name: "asc" },
  });

  const rows = creators.map((c) => ({
    nombre: c.name,
    telefono: c.phone,
    nicho: c.niche,
    fecha_incorporacion: c.joinDate.toISOString().slice(0, 10),
    tiktok: c.tiktokUser ?? "",
    pais: c.country ?? "",
    estado: c.status,
    grupo: c.groupName ?? "",
    notas: c.notes ?? "",
  }));

  const sheet = XLSX.utils.json_to_sheet(rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Creadores");
  const buffer = XLSX.write(book, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="creadores.xlsx"',
    },
  });
}
