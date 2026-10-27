import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function datasourceUrl() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url || /[?&]connection_limit=/.test(url)) return url;
  // Con 1 conexión los Promise.all de las rutas se ejecutan en fila; el pooler (6543) aguanta varias.
  return `${url}${url.includes("?") ? "&" : "?"}connection_limit=5`;
}

export function isMissingSchema(e: unknown) {
  const code =
    typeof e === "object" && e && "code" in e ? String((e as { code: unknown }).code) : "";
  return code === "P2021" || code === "P2022";
}

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    datasources: datasourceUrl() ? { db: { url: datasourceUrl() } } : undefined,
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
