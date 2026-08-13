import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  await prisma.campaignCreator.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.settlement.deleteMany();
  await prisma.contract.deleteMany();
  await prisma.task.deleteMany();
  await prisma.liveSchedule.deleteMany();
  await prisma.metric.deleteMany();
  await prisma.creator.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await bcrypt.hash("admin123", 10);

  const admin = await prisma.user.create({
    data: {
      name: "Admin Agencia",
      email: "admin@agencia.com",
      passwordHash,
      role: "admin",
    },
  });

  const manager = await prisma.user.create({
    data: {
      name: "Sofía Manager",
      email: "sofia@agencia.com",
      passwordHash: await bcrypt.hash("manager123", 10),
      role: "manager",
    },
  });

  const niches = [
    "Gaming",
    "Bailes",
    "Lifestyle",
    "Comedia",
    "Música",
    "Belleza",
    "Chat",
    "ASMR",
    "Deportes",
    "Otros",
  ];

  const names = [
    ["Luna Vega", "5512340001", "lunavega", "Team Alpha"],
    ["Diego Sparks", "5512340002", "diegosparks", "Team Alpha"],
    ["Mía Torres", "5512340003", "miatorreslive", "Team Beta"],
    ["Kai Rivera", "5512340004", "kairivera", "Team Beta"],
    ["Nora Kim", "5512340005", "norakimtt", "Team Alpha"],
    ["Bruno Díaz", "5512340006", "brunodiazlive", "Team Gamma"],
    ["Ava Chen", "5512340007", "avachen", "Team Gamma"],
    ["Leo Martín", "5512340008", "leomartinlive", "Team Beta"],
    ["Sofía Park", "5512340009", "sofiapark", "Team Alpha"],
    ["Hugo Santos", "5512340010", "hugosantos", "Team Gamma"],
  ];

  const creators = [];
  for (let i = 0; i < names.length; i++) {
    const [name, phone, tiktokUser, groupName] = names[i];
    const join = new Date();
    join.setDate(join.getDate() - (20 + i * 7));
    const creator = await prisma.creator.create({
      data: {
        name,
        phone,
        niche: niches[i % niches.length],
        joinDate: join,
        tiktokUser,
        country: "MX",
        status: i === 9 ? "pausado" : "activo",
        groupName,
        notes: i % 2 === 0 ? "Prioridad growth este mes" : null,
        managerId: i % 2 === 0 ? admin.id : manager.id,
      },
    });
    creators.push(creator);
  }

  const today = new Date();
  for (const creator of creators.slice(0, 8)) {
    for (let d = 0; d < 12; d++) {
      const date = new Date(today);
      date.setDate(date.getDate() - d);
      if (d % 3 === 0) continue;
      await prisma.metric.create({
        data: {
          creatorId: creator.id,
          date,
          diamonds: 8000 + Math.floor(Math.random() * 35000),
          hoursLive: 2 + Math.random() * 4,
          peakViewers: 100 + Math.floor(Math.random() * 1200),
          battles: Math.floor(Math.random() * 6),
        },
      });
    }
  }

  for (let i = 0; i < 8; i++) {
    const startAt = new Date();
    startAt.setDate(startAt.getDate() + (i % 5));
    startAt.setHours(18 + (i % 4), 0, 0, 0);
    await prisma.liveSchedule.create({
      data: {
        creatorId: creators[i].id,
        startAt,
        durationMin: 120,
        notes: "Slot principal",
        status: "planeado",
      },
    });
  }

  await prisma.task.createMany({
    data: [
      {
        title: "Onboarding documentos",
        description: "Pedir INE y datos bancarios",
        creatorId: creators[0].id,
        assigneeId: admin.id,
        priority: "alta",
        status: "pendiente",
        dueDate: new Date(),
      },
      {
        title: "Coaching de horarios",
        creatorId: creators[2].id,
        assigneeId: manager.id,
        priority: "media",
        status: "en_progreso",
        dueDate: new Date(Date.now() + 86400000 * 2),
      },
      {
        title: "Revisar PK strategy",
        creatorId: creators[4].id,
        assigneeId: admin.id,
        priority: "alta",
        status: "pendiente",
        dueDate: new Date(Date.now() + 86400000),
      },
      {
        title: "Actualizar roster Backstage",
        assigneeId: manager.id,
        priority: "baja",
        status: "hecha",
      },
    ],
  });

  const campaign = await prisma.campaign.create({
    data: {
      name: "Creator League Agosto",
      description: "Meta interna de diamantes y horas LIVE del mes",
      startDate: new Date(today.getFullYear(), today.getMonth(), 1),
      endDate: new Date(today.getFullYear(), today.getMonth() + 1, 0),
      targetDiamonds: 500000,
      targetHours: 200,
      status: "activa",
    },
  });

  for (const creator of creators.slice(0, 6)) {
    await prisma.campaignCreator.create({
      data: {
        campaignId: campaign.id,
        creatorId: creator.id,
        progressDiamonds: 20000 + Math.floor(Math.random() * 60000),
        progressHours: 10 + Math.random() * 20,
      },
    });
  }

  // Liquidaciones y bonos se crean solo desde el panel (sin seed demo)

  for (const creator of creators.slice(0, 4)) {
    await prisma.contract.create({
      data: {
        creatorId: creator.id,
        title: `Contrato management ${today.getFullYear()}`,
        status: "activo",
        startDate: creator.joinDate,
        endDate: new Date(today.getFullYear() + 1, today.getMonth(), 1),
        notes: "Comisión 30% · exclusividad LIVE",
      },
    });
  }

  console.log("Seed OK");
  console.log("Login: admin@agencia.com / admin123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
