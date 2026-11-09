import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { isAgencySlug } from "@/lib/agencies";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

/** Freno básico por IP (por instancia del servidor): 5 inscripciones por hora. */
const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  if (list.length >= 5) { hits.set(ip, list); return true; }
  list.push(now);
  hits.set(ip, list);
  return false;
}

/** La edición que hoy acepta inscripciones (la más próxima con el registro abierto), sin datos internos. */
async function openEdition(agencySlug: string) {
  const today = new Date().toISOString().slice(0, 10);
  return prisma.auctionEdition.findFirst({
    where: { agencySlug, status: "programada", registrationOpen: true, date: { gte: today } },
    orderBy: { date: "asc" },
    select: { id: true, number: true, date: true, time: true, host: true },
  });
}

export async function GET(req: NextRequest) {
  const agency = req.nextUrl.searchParams.get("agency") ?? "";
  if (!isAgencySlug(agency)) return json({ error: "Agencia inválida" }, 400);
  const e = await openEdition(agency);
  return json({ edition: e ? { number: e.number, date: e.date, time: e.time, host: e.host } : null });
}

const url = z.string().trim().max(300).refine((v) => /^https?:\/\/\S+$/i.test(v), "Enlace inválido");
const schema = z.object({
  agency: z.string(),
  website: z.string().optional(), // trampa para bots: debe llegar vacío
  name: z.string().trim().min(2).max(120),
  tiktokUser: z.string().trim().min(2).max(60).transform((v) => v.replace(/^@/, "").toLowerCase()),
  profileUrl: url.optional().or(z.literal("")),
  creatorAgency: z.string().trim().min(1).max(120),
  photoUrl: url.optional().or(z.literal("")),
  bio: z.string().trim().min(10).max(500),
  contentType: z.string().trim().min(2).max(120),
  availability: z.string().trim().min(2).max(200),
  canChangeName: z.literal(true),
  cameraMode: z.enum(["camara", "imagen"]),
  acceptedRules: z.literal(true),
  imageConsent: z.boolean(),
});

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const randomCode = (n: number) => Array.from(randomBytes(n), (b) => ALPHABET[b % ALPHABET.length]).join("");

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (limited(ip)) return json({ error: "Demasiados intentos. Inténtalo más tarde." }, 429);

  const raw = await req.json().catch(() => null);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: "Revisa los datos: todos los campos obligatorios y las confirmaciones deben estar completos." }, 400);
  }
  const d = parsed.data;
  if (d.website) return json({ ok: true, folio: "—" }); // bot: se ignora en silencio
  if (!isAgencySlug(d.agency)) return json({ error: "Agencia inválida" }, 400);
  if (d.cameraMode === "imagen" && !d.photoUrl) return json({ error: "Si no usarás cámara, indica el enlace de tu imagen representativa." }, 400);

  const edition = await openEdition(d.agency);
  if (!edition) return json({ error: "Por ahora no hay una subasta con inscripciones abiertas." }, 409);

  const dup = await prisma.auctionRegistration.findUnique({
    where: { editionId_tiktokUser: { editionId: edition.id, tiktokUser: d.tiktokUser } },
    select: { id: true },
  });
  if (dup) return json({ error: "Ese usuario de TikTok ya está inscrito en esta subasta." }, 409);

  for (let i = 0; i < 3; i++) {
    const folio = `SUB${String(edition.number).padStart(2, "0")}-${randomCode(5)}`;
    try {
      await prisma.auctionRegistration.create({
        data: {
          agencySlug: d.agency, editionId: edition.id, folio, name: d.name, tiktokUser: d.tiktokUser,
          profileUrl: d.profileUrl || null, creatorAgency: d.creatorAgency, photoUrl: d.photoUrl || null,
          bio: d.bio, contentType: d.contentType, availability: d.availability, canChangeName: true,
          cameraMode: d.cameraMode, acceptedRules: true, imageConsent: d.imageConsent,
        },
      });
      return json({ ok: true, folio, edition: { number: edition.number, date: edition.date, time: edition.time } });
    } catch (e) {
      const code = typeof e === "object" && e && "code" in e ? String((e as { code: unknown }).code) : "";
      if (code === "P2002") {
        // Folio repetido (reintenta) o usuario duplicado en una carrera.
        const again = await prisma.auctionRegistration.findUnique({
          where: { editionId_tiktokUser: { editionId: edition.id, tiktokUser: d.tiktokUser } },
          select: { id: true },
        });
        if (again) return json({ error: "Ese usuario de TikTok ya está inscrito en esta subasta." }, 409);
        continue;
      }
      return json({ error: "No se pudo guardar tu inscripción. Inténtalo de nuevo." }, 500);
    }
  }
  return json({ error: "No se pudo generar tu folio. Inténtalo de nuevo." }, 500);
}
