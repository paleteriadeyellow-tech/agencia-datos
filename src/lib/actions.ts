"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { formatPhoneInputValue } from "@/lib/phone";

async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("No autenticado");
  return session;
}

async function requireAdmin() {
  const session = await requireSession();
  if (session.user.role !== "admin") {
    return { error: "Solo un admin puede hacer esto.", session: null as null };
  }
  return { error: null as null, session };
}

export async function registerManager(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");

  if (!name || !email || password.length < 6) {
    return { error: "Completa todos los campos (mín. 6 caracteres en la contraseña)." };
  }

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) return { error: "Ese email ya está registrado." };

  const count = await prisma.user.count();
  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      role: count === 0 ? "admin" : "manager",
    },
  });

  revalidatePath("/managers");
  revalidatePath("/creadores");
  return { ok: true };
}

/** Crear manager desde el panel (ya autenticado) */
export async function createManager(formData: FormData) {
  const gate = await requireAdmin();
  if (gate.error) return { error: gate.error };

  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const role = String(formData.get("role") || "manager");

  if (!name || !email || password.length < 6) {
    return { error: "Completa todos los campos (mín. 6 caracteres en la contraseña)." };
  }

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) return { error: "Ese email ya está registrado." };

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      role: role === "admin" ? "admin" : "manager",
    },
  });

  revalidatePath("/managers");
  revalidatePath("/creadores");
  return { ok: true };
}

export async function deleteManager(id: string) {
  const gate = await requireAdmin();
  if (gate.error) return { error: gate.error };
  const session = gate.session!;

  if (session.user.id === id) {
    return { error: "No puedes eliminar tu propia cuenta." };
  }

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return { error: "Manager no encontrado." };

  const assigned = await prisma.creator.count({ where: { managerId: id } });
  if (assigned > 0) {
    await prisma.creator.updateMany({
      where: { managerId: id },
      data: { managerId: null },
    });
  }

  await prisma.user.delete({ where: { id } });
  revalidatePath("/managers");
  revalidatePath("/creadores");
  return { ok: true };
}

export async function createCreator(formData: FormData) {
  await requireSession();
  const name = String(formData.get("name") || "").trim();
  const phoneRaw = String(formData.get("phone") || "").trim();
  const niche = String(formData.get("niche") || "").trim();
  const joinDate = String(formData.get("joinDate") || "");
  const tiktokUser = String(formData.get("tiktokUser") || "").trim() || null;
  const country = String(formData.get("country") || "MX").trim();
  const status = String(formData.get("status") || "activo");
  const groupName = String(formData.get("groupName") || "").trim() || null;
  const notes = String(formData.get("notes") || "").trim() || null;
  const managerId = String(formData.get("managerId") || "") || null;

  if (!name || !phoneRaw || !niche || !joinDate) {
    return { error: "Nombre, teléfono, nicho y fecha de incorporación son obligatorios.", ok: undefined, id: undefined };
  }

  const phone = formatPhoneInputValue(phoneRaw, country) || phoneRaw;

  const creator = await prisma.creator.create({
    data: {
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

  revalidatePath("/creadores");
  revalidatePath("/dashboard");
  return { ok: true as const, id: creator.id, error: undefined as string | undefined };
}

export async function updateCreator(id: string, formData: FormData) {
  const gate = await requireAdmin();
  if (gate.error) return { error: gate.error, ok: undefined, id: undefined };

  const phoneRaw = String(formData.get("phone") || "").trim();
  const country = String(formData.get("country") || "MX").trim();
  const phone = formatPhoneInputValue(phoneRaw, country) || phoneRaw;

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
      managerId: String(formData.get("managerId") || "") || null,
    },
  });
  revalidatePath("/creadores");
  revalidatePath(`/creadores/${id}`);
  revalidatePath("/dashboard");
  return { ok: true as const, id, error: undefined as string | undefined };
}

export async function deleteCreator(id: string) {
  const gate = await requireAdmin();
  if (gate.error) return { error: gate.error };
  await prisma.creator.delete({ where: { id } });
  revalidatePath("/creadores");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function createMetric(formData: FormData) {
  await requireSession();
  const creatorId = String(formData.get("creatorId") || "");
  const date = String(formData.get("date") || "");
  if (!creatorId || !date) return { error: "Creador y fecha son obligatorios." };

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

  revalidatePath("/metricas");
  revalidatePath("/dashboard");
  revalidatePath(`/creadores/${creatorId}`);
  return { ok: true };
}

export async function createTask(formData: FormData) {
  const session = await requireSession();
  const title = String(formData.get("title") || "").trim();
  if (!title) return { error: "El título es obligatorio." };

  const due = String(formData.get("dueDate") || "");
  const periodRaw = String(formData.get("period") || "");
  const period = /^\d{4}-\d{2}$/.test(periodRaw)
    ? periodRaw
    : `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;

  await prisma.task.create({
    data: {
      title,
      description: String(formData.get("description") || "").trim() || null,
      creatorId: String(formData.get("creatorId") || "") || null,
      assigneeId: session.user.id,
      priority: String(formData.get("priority") || "media"),
      status: String(formData.get("status") || "pendiente"),
      period,
      dueDate: due ? new Date(due) : null,
    },
  });

  revalidatePath("/tareas");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updateTaskStatus(id: string, status: string) {
  await requireSession();
  await prisma.task.update({ where: { id }, data: { status } });
  revalidatePath("/tareas");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function createCampaign(formData: FormData) {
  await requireSession();
  const name = String(formData.get("name") || "").trim();
  const startDate = String(formData.get("startDate") || "");
  const endDate = String(formData.get("endDate") || "");
  if (!name || !startDate || !endDate) {
    return { error: "Nombre y fechas son obligatorios." };
  }

  const campaign = await prisma.campaign.create({
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

  const creatorIds = formData.getAll("creatorIds").map(String).filter(Boolean);
  if (creatorIds.length) {
    await prisma.campaignCreator.createMany({
      data: creatorIds.map((creatorId) => ({
        campaignId: campaign.id,
        creatorId,
      })),
    });
  }

  revalidatePath("/campanas");
  return { ok: true };
}

export async function updateCampaign(formData: FormData) {
  await requireSession();
  const id = String(formData.get("id") || "").trim();
  const name = String(formData.get("name") || "").trim();
  const startDate = String(formData.get("startDate") || "");
  const endDate = String(formData.get("endDate") || "");
  if (!id || !name || !startDate || !endDate) {
    return { error: "ID, nombre y fechas son obligatorios." };
  }

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

  const creatorIds = formData.getAll("creatorIds").map(String).filter(Boolean);
  await prisma.campaignCreator.deleteMany({ where: { campaignId: id } });
  if (creatorIds.length) {
    await prisma.campaignCreator.createMany({
      data: creatorIds.map((creatorId) => ({
        campaignId: id,
        creatorId,
      })),
    });
  }

  revalidatePath("/campanas");
  return { ok: true };
}

export async function deleteCampaign(id: string) {
  await requireSession();
  if (!id) return { error: "Falta id" };
  await prisma.campaign.delete({ where: { id } });
  revalidatePath("/campanas");
  return { ok: true };
}

export async function updateCampaignProgress(
  campaignCreatorId: string,
  diamonds: number,
  hours: number
) {
  await requireSession();
  await prisma.campaignCreator.update({
    where: { id: campaignCreatorId },
    data: { progressDiamonds: diamonds, progressHours: hours },
  });
  revalidatePath("/campanas");
  return { ok: true };
}

export async function upsertSettlement(formData: FormData) {
  await requireSession();
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

  await prisma.settlement.upsert({
    where: { creatorId_month: { creatorId, month } },
    create: {
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

  revalidatePath("/finanzas");
  return { ok: true };
}

export async function deleteSettlement(id: string) {
  await requireSession();
  await prisma.settlement.delete({ where: { id } });
  revalidatePath("/finanzas");
  return { ok: true };
}

export async function clearAllSettlements() {
  await requireSession();
  const result = await prisma.settlement.deleteMany();
  revalidatePath("/finanzas");
  return { ok: true, count: result.count };
}

export async function createContract(formData: FormData) {
  await requireSession();
  const creatorId = String(formData.get("creatorId") || "");
  const title = String(formData.get("title") || "").trim();
  if (!creatorId || !title) return { error: "Creador y título son obligatorios." };

  const startDate = String(formData.get("startDate") || "");
  const endDate = String(formData.get("endDate") || "");

  await prisma.contract.create({
    data: {
      creatorId,
      title,
      status: String(formData.get("status") || "activo"),
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      fileUrl: String(formData.get("fileUrl") || "").trim() || null,
      notes: String(formData.get("notes") || "").trim() || null,
    },
  });

  revalidatePath("/contratos");
  return { ok: true };
}
