import type { JWT } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/permissions";

export function userIdFromToken(token: JWT) {
  return (token.id ?? token.sub) as string | undefined;
}

export function roleFromToken(token: JWT) {
  return token.role as string | undefined;
}

export type ManagerScope =
  | { admin: true; userId?: string }
  | { admin: false; userId: string };

export function getScope(token: Pick<JWT, "id" | "sub" | "role">): ManagerScope {
  const userId = userIdFromToken(token as JWT);
  const role = roleFromToken(token as JWT);
  if (isAdmin(role)) return { admin: true, userId };
  if (!userId) throw new Error("Missing user id");
  return { admin: false, userId };
}

export function creatorWhere(
  scope: ManagerScope,
  agencySlug: string
): Prisma.CreatorWhereInput {
  if (scope.admin) return { agencySlug };
  return { agencySlug, managerId: scope.userId };
}

export function metricWhere(
  scope: ManagerScope,
  agencySlug: string
): Prisma.MetricWhereInput {
  return { creator: creatorWhere(scope, agencySlug) };
}

export function taskWhere(
  scope: ManagerScope,
  agencySlug: string,
  extra?: Prisma.TaskWhereInput
): Prisma.TaskWhereInput {
  const base: Prisma.TaskWhereInput = { agencySlug, ...(extra ?? {}) };
  if (scope.admin) return base;
  return {
    AND: [
      base,
      {
        OR: [
          { creatorId: null },
          { creator: { managerId: scope.userId } },
        ],
      },
    ],
  };
}

export async function getAssignedCreatorMatchKeys(
  userId: string,
  agencySlug: string
) {
  const creators = await prisma.creator.findMany({
    where: { agencySlug, managerId: userId },
    select: { id: true, name: true, tiktokUser: true },
  });
  const ids = creators.map((c) => c.id);
  const names = new Set<string>();
  for (const c of creators) {
    names.add(c.name.toLowerCase().trim());
    const nick = (c.tiktokUser || "").replace(/^@/, "").trim().toLowerCase();
    if (nick) names.add(nick);
  }
  return { creators, ids, names };
}

export function cleanNick(v: string) {
  return v.replace(/^@/, "").trim().toLowerCase();
}

export async function diamondWhere(
  scope: ManagerScope,
  agencySlug: string
): Promise<Prisma.DiamondControlWhereInput> {
  if (scope.admin) return { agencySlug };
  const { ids, names } = await getAssignedCreatorMatchKeys(
    scope.userId,
    agencySlug
  );
  if (!ids.length && !names.size) {
    return { agencySlug, id: { in: [] } };
  }
  const nameList = [...names];
  const or: Prisma.DiamondControlWhereInput[] = [];
  if (ids.length) or.push({ creatorId: { in: ids } });
  if (nameList.length) {
    or.push({ username: { in: nameList } });
  }
  return { agencySlug, OR: or };
}

export async function assertCreatorAccess(
  scope: ManagerScope,
  creatorId: string,
  agencySlug: string
) {
  if (scope.admin) {
    const found = await prisma.creator.findFirst({
      where: { id: creatorId, agencySlug },
      select: { id: true },
    });
    if (!found) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    return null;
  }
  const found = await prisma.creator.findFirst({
    where: { id: creatorId, agencySlug, managerId: scope.userId },
    select: { id: true },
  });
  if (!found) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  return null;
}

export async function filterCreatorIdsForScope(
  scope: ManagerScope,
  creatorIds: string[],
  agencySlug: string
) {
  if (!creatorIds.length) return [];
  const allowed = await prisma.creator.findMany({
    where: {
      ...creatorWhere(scope, agencySlug),
      id: { in: creatorIds },
    },
    select: { id: true },
  });
  const allowedSet = new Set(allowed.map((c) => c.id));
  return creatorIds.filter((id) => allowedSet.has(id));
}

export async function assertCreatorNickAccess(
  scope: ManagerScope,
  nick: string,
  agencySlug: string
) {
  if (scope.admin) return null;
  const key = cleanNick(nick);
  if (!key) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const { names } = await getAssignedCreatorMatchKeys(scope.userId, agencySlug);
  if (!names.has(key)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  return null;
}

export async function filterRowsByAssignedNicks<T extends { nombre: string }>(
  scope: ManagerScope,
  rows: T[],
  agencySlug: string
): Promise<T[]> {
  if (scope.admin) return rows;
  const { names } = await getAssignedCreatorMatchKeys(scope.userId, agencySlug);
  return rows.filter((r) => names.has(cleanNick(r.nombre)));
}
