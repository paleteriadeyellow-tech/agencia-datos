"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { formatPhoneInputValue } from "@/lib/phone";
import { isAgencySlug, type AgencySlug } from "@/lib/agencies";
import { isAdmin } from "@/lib/permissions";
import { filterCreatorIdsForScope, getScope } from "@/lib/creator-scope";
import { parseViewAsId, VIEW_AS_COOKIE } from "@/lib/view-as";

function revalidateAgency(agencySlug: string, ...paths: string[]) {
  for (const p of paths) {
    const clean = p.startsWith("/") ? p : `/${p}`;
    revalidatePath(`/a/${agencySlug}${clean}`);
  }
}

async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.user.agencySlug) {
    throw new Error("No autenticado");
  }
  if (!isAgencySlug(session.user.agencySlug)) {
    throw new Error("Sesión sin agencia");
  }
  return session as typeof session & {
    user: { id: string; role: string; agencySlug: AgencySlug };
  };
}

async function requireAdmin() {
  const session = await requireSession();
  if (session.user.role !== "admin") {
    return { error: "Solo un admin puede hacer esto.", session: null as null };
  }
  return { error: null as null, session };
}

export async function registerManager(_formData: FormData) {
  return {
    error:
      "El registro público está cerrado. Pide a un admin que te cree la cuenta en Managers.",
  };
}

export async function createManager(formData: FormData) {
  const gate = await requireAdmin();
  if (gate.error) return { error: gate.error };
  const agencySlug = gate.session!.user.agencySlug;

  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const role = String(formData.get("role") || "manager");

  if (!name || !email || password.length < 6) {
    return { error: "Completa todos los campos (mín. 6 caracteres en la contraseña)." };
  }

  const exists = await prisma.user.findUnique({
    where: { agencySlug_email: { agencySlug, email } },
  });
  if (exists) return { error: "Ese email ya está registrado en esta agencia." };

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.create({
    data: {
      agencySlug,
      name,
      email,
      passwordHash,
      role: role === "admin" ? "admin" : "manager",
    },
  });

  revalidateAgency(agencySlug, "/managers", "/creadores");
  return { ok: true };
}

export async function deleteManager(id: string) {
  const gate = await requireAdmin();
  if (gate.error) return { error: gate.error };
  const session = gate.session!;
  const agencySlug = session.user.agencySlug;

  if (session.user.id === id) {
    return { error: "No puedes eliminar tu propia cuenta." };
  }

  const user = await prisma.user.findFirst({
    where: { id, agencySlug },
  });
  if (!user) return { error: "Manager no encontrado." };

  const assigned = await prisma.creator.count({
    where: { managerId: id, agencySlug },
  });
  if (assigned > 0) {
    await prisma.creator.updateMany({
      where: { managerId: id, agencySlug },
      data: { managerId: null },
    });
  }

  await prisma.user.delete({ where: { id } });
  revalidateAgency(agencySlug, "/managers", "/creadores");
  return { ok: true };
}

export async function createCreator(formData: FormData) {
  const session = await requireSession();
  const agencySlug = session.user.agencySlug;
  const name = String(formData.get("name") || "").trim();
  const phoneRaw = String(formData.get("phone") || "").trim();
  const niche = String(formData.get("niche") || "").trim();
  const joinDate = String(formData.get("joinDate") || "");
  const tiktokUser = String(formData.get("tiktokUser") || "").trim() || null;
  const country = String(formData.get("country") || "MX").trim();
  const status = String(formData.get("status") || "activo");
  const groupName = String(formData.get("groupName") || "").trim() || null;
  const notes = String(formData.get("notes") || "").trim() || null;
  let managerId = String(formData.get("managerId") || "") || null;
  if (!isAdmin(session.user.role)) {
    managerId = session.user.id;
  } else if (!managerId) {
    const viewAsId = parseViewAsId(
      (await cookies()).get(VIEW_AS_COOKIE)?.value
    );
    if (viewAsId) managerId = viewAsId;
  }

  if (!name || !phoneRaw || !niche || !joinDate) {
    return { error: "Nombre, teléfono, nicho y fecha de incorporación son obligatorios.", ok: undefined, id: undefined };
  }

  if (managerId) {
    const mgr = await prisma.user.findFirst({
      where: { id: managerId, agencySlug },
    });
    if (!mgr) return { error: "Manager no válido para esta agencia.", ok: undefined, id: undefined };
  }

  const phone = formatPhoneInputValue(phoneRaw, country) || phoneRaw;

  const creator = await prisma.creator.create({
    data: {
      agencySlug,
      name,
      phone,
      niche,
      joinDate: new Date(joinDate),
      tiktokUser,
      country,
      status,
      groupName,
      notes,
      managerId: managerId || undefined,
    },
  });

  revalidateAgency(agencySlug, "/creadores", "/dashboard");
  return { ok: true as const, id: creator.id, error: undefined as string | undefined };
}

export async function updateCreator(id: string, formData: FormData) {
  const gate = await requireAdmin();
  if (gate.error) return { error: gate.error, ok: undefined, id: undefined };
  const agencySlug = gate.session!.user.agencySlug;

  const existing = await prisma.creator.findFirst({ where: { id, agencySlug } });
  if (!existing) return { error: "Creador no encontrado.", ok: undefined, id: undefined };

  const phoneRaw = String(formData.get("phone") || "").trim();
  const country = String(formData.get("country") || "MX").trim();
  const phone = formatPhoneInputValue(phoneRaw, country) || phoneRaw;
  const managerId = String(formData.get("managerId") || "") || null;

  if (managerId) {
    const mgr = await prisma.user.findFirst({
      where: { id: managerId, agencySlug },
    });
    if (!mgr) return { error: "Manager no válido.", ok: undefined, id: undefined };
  }

  await prisma.creator.update({
    where: { id },
    data: {
      name: String(formData.get("name") || "").trim(),
      phone,
      niche: String(formData.get("niche") || "").trim(),
      joinDate: new Date(String(formData.get("joinDate") || "")),
      tiktokUser: String(formData.get("tiktokUser") || "").trim() || null,
      country,
      status: String(formData.get("status") || "activo"),
      groupName: String(formData.get("groupName") || "").trim() || null,
      notes: String(formData.get("notes") || "").trim() || null,
      managerId,
    },
  });
  revalidateAgency(agencySlug, "/creadores", `/creadores/${id}`, "/dashboard");
  return { ok: true as const, id, error: undefined as string | undefined };
}

export async function deleteCreator(id: string) {
  const gate = await requireAdmin();
  if (gate.error) return { error: gate.error };
  const agencySlug = gate.session!.user.agencySlug;
  const existing = await prisma.creator.findFirst({ where: { id, agencySlug } });
  if (!existing) return { error: "Creador no encontrado." };
  await prisma.creator.delete({ where: { id } });
  revalidateAgency(agencySlug, "/creadores", "/dashboard");
  return { ok: true };
}

export async function createMetric(formData: FormData) {
  const session = await requireSession();
  const agencySlug = session.user.agencySlug;
  const creatorId = String(formData.get("creatorId") || "");
  const date = String(formData.get("date") || "");
  if (!creatorId || !date) return { error: "Creador y fecha son obligatorios." };

  const creator = await prisma.creator.findFirst({
    where: { id: creatorId, agencySlug },
  });
  if (!creator) return { error: "Creador no válido." };
  if (!isAdmin(session.user.role) && creator.managerId !== session.user.id) {
    return { error: "No autorizado." };
  }

  await prisma.metric.create({
    data: {
      creatorId,
      date: new Date(date),
      diamonds: Number(formData.get("diamonds") || 0),
      hoursLive: Number(formData.get("hoursLive") || 0),
      peakViewers: Number(formData.get("peakViewers") || 0),
      battles: Number(formData.get("battles") || 0),
      notes: String(formData.get("notes") || "").trim() || null,
    },
  });

  revalidateAgency(agencySlug, "/metricas", "/dashboard", `/creadores/${creatorId}`);
  return { ok: true };
}

export async function createTask(formData: FormData) {
  const session = await requireSession();
  const agencySlug = session.user.agencySlug;
  const title = String(formData.get("title") || "").trim();
  if (!title) return { error: "El título es obligatorio." };

  const creatorId = String(formData.get("creatorId") || "") || null;
  if (creatorId) {
    const c = await prisma.creator.findFirst({
      where: { id: creatorId, agencySlug },
    });
    if (!c) return { error: "Creador no válido." };
    if (!isAdmin(session.user.role) && c.managerId !== session.user.id) {
      return { error: "No autorizado." };
    }
  }

  const due = String(formData.get("dueDate") || "");
  const periodRaw = String(formData.get("period") || "");
  const period = /^\d{4}-\d{2}$/.test(periodRaw)
    ? periodRaw
    : `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;

  await prisma.task.create({
    data: {
      agencySlug,
      title,
      description: String(formData.get("description") || "").trim() || null,
      creatorId,
      assigneeId: session.user.id,
      priority: String(formData.get("priority") || "media"),
      status: String(formData.get("status") || "pendiente"),
      period,
      dueDate: due ? new Date(due) : null,
    },
  });

  revalidateAgency(agencySlug, "/tareas", "/dashboard");
  return { ok: true };
}

export async function updateTaskStatus(id: string, status: string) {
  const session = await requireSession();
  const agencySlug = session.user.agencySlug;
  const task = await prisma.task.findFirst({ where: { id, agencySlug } });
  if (!task) return { error: "Tarea no encontrada." };
  if (task.creatorId && !isAdmin(session.user.role)) {
    const creator = await prisma.creator.findFirst({
      where: { id: task.creatorId, agencySlug, managerId: session.user.id },
    });
    if (!creator) return { error: "No autorizado." };
  }
  await prisma.task.update({ where: { id }, data: { status } });
  revalidateAgency(agencySlug, "/tareas", "/dashboard");
  return { ok: true };
}

export async function createCampaign(formData: FormData) {
  const session = await requireSession();
  const agencySlug = session.user.agencySlug;
  const name = String(formData.get("name") || "").trim();
  const startDate = String(formData.get("startDate") || "");
  const endDate = String(formData.get("endDate") || "");
  if (!name || !startDate || !endDate) {
    return { error: "Nombre y fechas son obligatorios." };
  }

  const campaign = await prisma.campaign.create({
    data: {
      agencySlug,
      name,
      description: String(formData.get("description") || "").trim() || null,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      targetDiamonds: Number(formData.get("targetDiamonds") || 0),
      targetHours: Number(formData.get("targetHours") || 0),
      status: String(formData.get("status") || "activa"),
    },
  });

  const creatorIds = formData.getAll("creatorIds").map(String).filter(Boolean);
  if (creatorIds.length) {
    const scope = getScope({
      id: session.user.id,
      role: session.user.role,
    });
    const ids = await filterCreatorIdsForScope(scope, creatorIds, agencySlug);
    if (!scope.admin && ids.length !== creatorIds.length) {
      return { error: "No puedes asignar creadores que no te pertenecen." };
    }
    if (ids.length) {
      await prisma.campaignCreator.createMany({
        data: ids.map((creatorId) => ({
          campaignId: campaign.id,
          creatorId,
        })),
      });
    }
  }

  revalidateAgency(agencySlug, "/campanas");
  return { ok: true };
}

export async function updateCampaign(formData: FormData) {
  const session = await requireSession();
  const agencySlug = session.user.agencySlug;
  const id = String(formData.get("id") || "").trim();
  const name = String(formData.get("name") || "").trim();
  const startDate = String(formData.get("startDate") || "");
  const endDate = String(formData.get("endDate") || "");
  if (!id || !name || !startDate || !endDate) {
    return { error: "ID, nombre y fechas son obligatorios." };
  }

  const existing = await prisma.campaign.findFirst({
    where: { id, agencySlug },
  });
  if (!existing) return { error: "Campaña no encontrada." };

  await prisma.campaign.update({
    where: { id },
    data: {
      name,
      description: String(formData.get("description") || "").trim() || null,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      targetDiamonds: Number(formData.get("targetDiamonds") || 0),
      targetHours: Number(formData.get("targetHours") || 0),
      status: String(formData.get("status") || "activa"),
    },
  });

  const rawCreatorIds = formData.getAll("creatorIds").map(String).filter(Boolean);
  const scope = getScope({
    id: session.user.id,
    role: session.user.role,
  });
  const managerCreatorIds = await filterCreatorIdsForScope(
    scope,
    rawCreatorIds,
    agencySlug
  );
  if (!scope.admin && rawCreatorIds.length !== managerCreatorIds.length) {
    return { error: "No puedes asignar creadores que no te pertenecen." };
  }

  if (scope.admin) {
    await prisma.campaignCreator.deleteMany({ where: { campaignId: id } });
    if (managerCreatorIds.length) {
      await prisma.campaignCreator.createMany({
        data: managerCreatorIds.map((creatorId) => ({
          campaignId: id,
          creatorId,
        })),
      });
    }
  } else {
    const existingLinks = await prisma.campaignCreator.findMany({
      where: { campaignId: id },
      select: { creatorId: true },
    });
    const owned = await prisma.creator.findMany({
      where: { agencySlug, managerId: session.user.id },
      select: { id: true },
    });
    const ownedSet = new Set(owned.map((c) => c.id));
    const keepOthers = existingLinks
      .map((e) => e.creatorId)
      .filter((creatorId) => !ownedSet.has(creatorId));
    const finalIds = [...new Set([...keepOthers, ...managerCreatorIds])];
    await prisma.campaignCreator.deleteMany({ where: { campaignId: id } });
    if (finalIds.length) {
      await prisma.campaignCreator.createMany({
        data: finalIds.map((creatorId) => ({
          campaignId: id,
          creatorId,
        })),
      });
    }
  }

  revalidateAgency(agencySlug, "/campanas");
  return { ok: true };
}

export async function deleteCampaign(id: string) {
  const session = await requireSession();
  const agencySlug = session.user.agencySlug;
  if (!id) return { error: "Falta id" };
  const existing = await prisma.campaign.findFirst({
    where: { id, agencySlug },
  });
  if (!existing) return { error: "Campaña no encontrada." };
  await prisma.campaign.delete({ where: { id } });
  revalidateAgency(agencySlug, "/campanas");
  return { ok: true };
}

export async function updateCampaignProgress(
  campaignCreatorId: string,
  diamonds: number,
  hours: number
) {
  const session = await requireSession();
  const agencySlug = session.user.agencySlug;
  const row = await prisma.campaignCreator.findFirst({
    where: { id: campaignCreatorId, campaign: { agencySlug } },
  });
  if (!row) return { error: "Registro no encontrado." };
  await prisma.campaignCreator.update({
    where: { id: campaignCreatorId },
    data: { progressDiamonds: diamonds, progressHours: hours },
  });
  revalidateAgency(agencySlug, "/campanas");
  return { ok: true };
}

export async function upsertSettlement(formData: FormData) {
  const session = await requireSession();
  const agencySlug = session.user.agencySlug;
  const creatorId = String(formData.get("creatorId") || "");
  const month = String(formData.get("month") || "");
  const diamonds = Number(formData.get("diamonds") || 0);
  const hours = Number(formData.get("hours") || 0);
  const days = Math.max(0, Math.round(Number(formData.get("days") || 0)));
  const bono = Number(formData.get("bono") || formData.get("estimatedPay") || 0);
  const agencyAmount = Number(
    formData.get("agencyAmount") || formData.get("agencyGain") || 0
  );

  if (!creatorId || !month) return { error: "Creador y mes son obligatorios." };

  const creator = await prisma.creator.findFirst({
    where: { id: creatorId, agencySlug },
  });
  if (!creator) return { error: "Creador no válido." };

  await prisma.settlement.upsert({
    where: { creatorId_month: { creatorId, month } },
    create: {
      agencySlug,
      creatorId,
      month,
      diamonds,
      hours,
      days,
      estimatedPay: bono,
      agencyPercent: 0,
      agencyAmount,
      creatorAmount: bono,
      status: String(formData.get("status") || "pendiente"),
      notes: String(formData.get("notes") || "").trim() || null,
    },
    update: {
      diamonds,
      hours,
      days,
      estimatedPay: bono,
      agencyPercent: 0,
      agencyAmount,
      creatorAmount: bono,
      status: String(formData.get("status") || "pendiente"),
      notes: String(formData.get("notes") || "").trim() || null,
    },
  });

  revalidateAgency(agencySlug, "/finanzas");
  return { ok: true };
}

export async function deleteSettlement(id: string) {
  const session = await requireSession();
  const agencySlug = session.user.agencySlug;
  const row = await prisma.settlement.findFirst({
    where: { id, agencySlug },
  });
  if (!row) return { error: "Liquidación no encontrada." };
  await prisma.settlement.delete({ where: { id } });
  revalidateAgency(agencySlug, "/finanzas");
  return { ok: true };
}

export async function clearAllSettlements() {
  const session = await requireSession();
  const agencySlug = session.user.agencySlug;
  const result = await prisma.settlement.deleteMany({ where: { agencySlug } });
  revalidateAgency(agencySlug, "/finanzas");
  return { ok: true, count: result.count };
}

export async function createContract(formData: FormData) {
  const session = await requireSession();
  const agencySlug = session.user.agencySlug;
  const creatorId = String(formData.get("creatorId") || "");
  const title = String(formData.get("title") || "").trim();
  if (!creatorId || !title) return { error: "Creador y título son obligatorios." };

  const creator = await prisma.creator.findFirst({
    where: { id: creatorId, agencySlug },
  });
  if (!creator) return { error: "Creador no válido." };

  const startDate = String(formData.get("startDate") || "");
  const endDate = String(formData.get("endDate") || "");

  await prisma.contract.create({
    data: {
      agencySlug,
      creatorId,
      title,
      status: String(formData.get("status") || "activo"),
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      fileUrl: String(formData.get("fileUrl") || "").trim() || null,
      notes: String(formData.get("notes") || "").trim() || null,
    },
  });

  revalidateAgency(agencySlug, "/contratos");
  return { ok: true };
}
