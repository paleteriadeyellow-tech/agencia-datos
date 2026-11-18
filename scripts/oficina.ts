/**
 * Herramienta de la Oficina IA para operar el panel desde la computadora de Majo.
 *
 *   npx tsx scripts/oficina.ts <comando> [--agencia elarbol] [opciones]
 *
 * Consultas (no cambian nada):
 *   resumen                         Reporte del día (diamantes, meta, riesgos, tareas atrasadas)
 *   buscar [--categoria riesgo|sin_actividad|cerca] [--manager N] [--texto T] [--limite 50]
 *   creador --nombre N              Ficha de un creador
 *   equipo                          Equipo con creadores y tareas atrasadas
 *   tareas [--persona N] [--atrasadas] [--limite 40]
 *   whatsapp (--categoria C | --creadores "a,b") --mensaje "Hola {nombre}…" [--manager N] [--html ruta.html]
 *
 * Cambios (sin --confirmar solo muestran una VISTA PREVIA; con --confirmar lo hacen):
 *   actualizar-datos [--archivo ruta.xlsx] [--periodo YYYY-MM] [--forzar]
 *   robot
 *   crear-tarea --titulo T [--asignar N] [--creador N] [--prioridad baja|media|alta] [--fecha YYYY-MM-DD] [--descripcion D]
 *   nota --creador N --texto T
 *   asignar-manager --creador N --manager N
 */
import "dotenv/config";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as XLSX from "xlsx";
import { prisma } from "../src/lib/prisma";
import { AGENCIES, isAgencySlug, type AgencySlug } from "../src/lib/agencies";
import { buildRobotReport, runRobot, type RobotKind } from "../src/lib/robot";
import { todayKey } from "../src/lib/task-generator";
import { whatsappUrl } from "../src/lib/phone";
import { parseBackstageSheet } from "../src/lib/backstage-import";
import { importDiamondRows } from "../src/lib/backstage-import-server";

const ACTOR = "Oficina IA";

// ---------- argumentos ----------
const [cmd, ...rest] = process.argv.slice(2);
const opts: Record<string, string | true> = {};
for (let i = 0; i < rest.length; i++) {
  const a = rest[i];
  if (!a.startsWith("--")) continue;
  const next = rest[i + 1];
  if (next === undefined || next.startsWith("--")) opts[a.slice(2)] = true;
  else {
    opts[a.slice(2)] = next;
    i++;
  }
}
const str = (k: string) => (typeof opts[k] === "string" ? (opts[k] as string) : undefined);
const flag = (k: string) => opts[k] === true;
const num = (k: string, d: number) => (str(k) ? Math.max(1, Number(str(k)) || d) : d);
const confirm = flag("confirmar");

const agencyArg = str("agencia") ?? "elarbol";
if (!isAgencySlug(agencyArg)) fail(`Agencia no válida: ${agencyArg}. Usa: ${Object.keys(AGENCIES).join(", ")}`);
const agencySlug = agencyArg as AgencySlug;
const period = () => todayKey().slice(0, 7);

function out(data: unknown) {
  console.log(typeof data === "string" ? data : JSON.stringify(data, null, 2));
}
function fail(msg: string): never {
  console.log(`ERROR: ${msg}`);
  process.exit(1);
}
function preview(what: string, details?: unknown) {
  out({ vista_previa: true, haria: what, detalles: details, para_hacerlo: "Vuelve a correr el MISMO comando agregando --confirmar (solo después de que Majo apruebe)." });
}

const clean = (v: string) => v.replace(/^@/, "").trim().toLowerCase();
const fmt = (n: number) => Math.round(n).toLocaleString("es-MX");

// ---------- búsquedas por nombre ----------
async function findCreator(name: string) {
  const q = clean(name);
  const all = await prisma.creator.findMany({
    where: { agencySlug, OR: [{ name: { contains: q, mode: "insensitive" } }, { tiktokUser: { contains: q, mode: "insensitive" } }] },
    select: { id: true, name: true, tiktokUser: true, phone: true, country: true, status: true, managerId: true, manager: { select: { name: true } } },
    take: 10,
  });
  const exact = all.filter((c) => clean(c.name) === q || (c.tiktokUser && clean(c.tiktokUser) === q));
  if (exact.length === 1) return exact[0];
  if (all.length === 1) return all[0];
  if (!all.length) fail(`No encontré ningún creador "${name}" en ${AGENCIES[agencySlug].shortName}.`);
  fail(`Varios creadores coinciden con "${name}": ${all.map((c) => c.name).join(", ")}. Especifica cuál.`);
}

async function findUser(name: string) {
  const q = name.trim().toLowerCase();
  const users = await prisma.user.findMany({ where: { agencySlug }, select: { id: true, name: true } });
  const exact = users.filter((u) => u.name.toLowerCase() === q);
  const list = exact.length ? exact : users.filter((u) => u.name.toLowerCase().includes(q));
  if (list.length === 1) return list[0];
  if (!list.length) fail(`No hay nadie del equipo llamado "${name}". Equipo: ${users.map((u) => u.name).join(", ")}.`);
  fail(`Varias personas coinciden con "${name}": ${list.map((u) => u.name).join(", ")}.`);
}

async function statsFor(ids: string[]) {
  const rows = await prisma.diamondControl.findMany({ where: { agencySlug, period: period() } });
  const creators = await prisma.creator.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, tiktokUser: true } });
  const byId = new Map(rows.filter((r) => r.creatorId).map((r) => [r.creatorId!, r]));
  const byNick = new Map(rows.map((r) => [clean(r.username), r]));
  const res = new Map<string, { diamantes: number; horas: number; dias: number }>();
  for (const c of creators) {
    const r = byId.get(c.id) ?? (c.tiktokUser ? byNick.get(clean(c.tiktokUser)) : undefined) ?? byNick.get(clean(c.name));
    res.set(c.id, { diamantes: r?.diamonds ?? 0, horas: r?.hours ?? 0, dias: r?.days ?? 0 });
  }
  return res;
}

// ---------- comandos ----------
async function resumen() {
  const r = await buildRobotReport(agencySlug);
  const count = (k: RobotKind) => r.creators.filter((c) => c.kind === k).length;
  out({
    agencia: r.agencyName,
    fecha: r.today,
    dia_del_mes: `${r.dayOfMonth}/${r.daysInMonth}`,
    diamantes_mes: r.totalDiamonds,
    meta_mes: r.agencyGoal,
    proyeccion_cierre: r.projectedDiamonds,
    creadores_activos: r.activeCreators,
    en_riesgo: count("riesgo"),
    sin_live: count("sin_actividad"),
    cerca_de_nivel: count("cerca"),
    ultima_carga_backstage: r.lastImportAt,
    datos_viejos: r.dataStale,
    contratos_por_vencer: r.contractsExpiring,
    tareas_atrasadas_por_persona: r.overdueByManager.map((m) => ({ persona: m.managerName, atrasadas: m.count })),
  });
}

async function buscar() {
  const categoria = str("categoria");
  const limite = num("limite", 50);
  const texto = str("texto");
  const managerId = str("manager") ? (await findUser(str("manager")!)).id : undefined;
  if (categoria) {
    if (!["riesgo", "sin_actividad", "cerca"].includes(categoria)) fail("--categoria debe ser riesgo, sin_actividad o cerca");
    const r = await buildRobotReport(agencySlug);
    const list = r.creators
      .filter((c) => c.kind === categoria && (!managerId || c.managerId === managerId) && (!texto || clean(c.name).includes(clean(texto))))
      .slice(0, limite)
      .map((c) => ({ nombre: c.name, manager: c.managerName, diamantes: c.diamonds, horas: c.hours, dias: c.days, nivel: c.level, motivo: c.reason, tiene_telefono: Boolean(c.waLink) }));
    return out({ categoria, total: list.length, creadores: list });
  }
  const creators = await prisma.creator.findMany({
    where: {
      agencySlug,
      status: "activo",
      ...(managerId ? { managerId } : {}),
      ...(texto ? { OR: [{ name: { contains: texto, mode: "insensitive" } }, { tiktokUser: { contains: texto, mode: "insensitive" } }] } : {}),
    },
    select: { id: true, name: true, phone: true, manager: { select: { name: true } } },
  });
  const stats = await statsFor(creators.map((c) => c.id));
  const list = creators
    .map((c) => ({ nombre: c.name, manager: c.manager?.name ?? null, ...stats.get(c.id)!, tiene_telefono: Boolean(c.phone) }))
    .sort((a, b) => b.diamantes - a.diamantes)
    .slice(0, limite);
  out({ encontrados: creators.length, mostrando: list.length, creadores: list });
}

async function creador() {
  const n = str("nombre") ?? fail("Falta --nombre");
  const c = await findCreator(n);
  const [full, stats, notes, tasks] = await Promise.all([
    prisma.creator.findUnique({ where: { id: c.id }, select: { niche: true, joinDate: true, country: true, groupName: true, notes: true, livecoinsStatus: true } }),
    statsFor([c.id]),
    prisma.creatorNote.findMany({ where: { creatorId: c.id }, orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.task.findMany({ where: { creatorId: c.id, status: { not: "hecha" } }, select: { title: true, status: true, dueDate: true }, take: 10 }),
  ]);
  out({
    nombre: c.name,
    tiktok: c.tiktokUser,
    estado: c.status,
    manager: c.manager?.name ?? null,
    tiene_telefono: Boolean(c.phone),
    ...full,
    mes_actual: stats.get(c.id),
    notas_recientes: notes.map((x) => ({ fecha: x.createdAt.toISOString().slice(0, 10), autor: x.authorName, nota: x.body })),
    tareas_abiertas: tasks,
  });
}

async function equipo() {
  const today = new Date(`${todayKey()}T00:00:00.000Z`);
  const users = await prisma.user.findMany({
    where: { agencySlug },
    select: {
      name: true,
      role: true,
      position: true,
      _count: { select: { creators: { where: { status: "activo" } } } },
      tasks: { where: { status: { not: "hecha" } }, select: { dueDate: true } },
    },
  });
  out(
    users.map((u) => ({
      nombre: u.name,
      rol: u.role,
      puesto: u.position,
      creadores_activos: u._count.creators,
      tareas_pendientes: u.tasks.length,
      tareas_atrasadas: u.tasks.filter((t) => t.dueDate && t.dueDate < today).length,
    }))
  );
}

async function tareas() {
  const assigneeId = str("persona") ? (await findUser(str("persona")!)).id : undefined;
  const today = new Date(`${todayKey()}T00:00:00.000Z`);
  const where = { agencySlug, status: { not: "hecha" }, ...(assigneeId ? { assigneeId } : {}), ...(flag("atrasadas") ? { dueDate: { lt: today } } : {}) };
  const [total, list] = await Promise.all([
    prisma.task.count({ where }),
    prisma.task.findMany({
      where,
      orderBy: { dueDate: "asc" },
      take: num("limite", 40),
      select: { title: true, priority: true, status: true, dueDate: true, assignee: { select: { name: true } }, creator: { select: { name: true } } },
    }),
  ]);
  out({
    total,
    tareas: list.map((t) => ({ titulo: t.title, prioridad: t.priority, estado: t.status, fecha: t.dueDate?.toISOString().slice(0, 10) ?? null, asignada_a: t.assignee?.name ?? null, creador: t.creator?.name ?? null })),
  });
}

async function whatsapp() {
  const mensaje = str("mensaje") ?? fail('Falta --mensaje "Hola {nombre}…" (variables: {nombre} {diamantes} {horas} {dias})');
  let targets: { id: string; name: string; phone: string; country: string | null; managerId: string | null }[] = [];
  if (str("creadores")) {
    for (const n of str("creadores")!.split(",").map((s) => s.trim()).filter(Boolean)) {
      const c = await findCreator(n);
      targets.push({ id: c.id, name: c.name, phone: c.phone, country: c.country, managerId: c.managerId });
    }
  } else if (str("categoria")) {
    const r = await buildRobotReport(agencySlug);
    const ids = r.creators.filter((c) => c.kind === str("categoria")).map((c) => c.creatorId);
    targets = await prisma.creator.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, phone: true, country: true, managerId: true } });
  } else fail("Indica --categoria o --creadores");
  if (str("manager")) {
    const m = await findUser(str("manager")!);
    targets = targets.filter((t) => t.managerId === m.id);
  }
  const stats = await statsFor(targets.map((t) => t.id));
  const links: { nombre: string; mensaje: string; link: string }[] = [];
  const sinTelefono: string[] = [];
  for (const t of targets) {
    const s = stats.get(t.id) ?? { diamantes: 0, horas: 0, dias: 0 };
    const text = mensaje
      .replace(/\{nombre\}/g, t.name.split(/\s+/)[0])
      .replace(/\{diamantes\}/g, fmt(s.diamantes))
      .replace(/\{horas\}/g, s.horas.toFixed(1))
      .replace(/\{dias\}/g, String(s.dias));
    const base = t.phone ? whatsappUrl(t.phone, t.country) : null;
    if (!base) sinTelefono.push(t.name);
    else links.push({ nombre: t.name, mensaje: text, link: `${base}?text=${encodeURIComponent(text)}` });
  }
  const html = str("html");
  if (html) {
    const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);
    const page = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>WhatsApp ${esc(AGENCIES[agencySlug].shortName)} ${todayKey()}</title>
<style>body{font-family:system-ui,sans-serif;max-width:760px;margin:24px auto;padding:0 16px;background:#111;color:#eee}li{margin:10px 0;padding:10px;border:1px solid #333;border-radius:8px;list-style:none}a{display:inline-block;margin-top:6px;padding:6px 12px;background:#25d366;color:#000;border-radius:6px;text-decoration:none;font-weight:600}a:visited{background:#555;color:#ccc}small{color:#aaa}</style>
<h1>WhatsApp · ${esc(AGENCIES[agencySlug].shortName)} · ${todayKey()}</h1><p>${links.length} mensajes listos. Da clic en cada botón para abrir WhatsApp con el mensaje escrito y envíalo tú.</p>
<ul>${links.map((l) => `<li><b>${esc(l.nombre)}</b><br><small>${esc(l.mensaje)}</small><br><a href="${esc(l.link)}" target="_blank" rel="noopener">Abrir WhatsApp</a></li>`).join("")}</ul>
${sinTelefono.length ? `<p><small>Sin teléfono: ${esc(sinTelefono.join(", "))}</small></p>` : ""}`;
    fs.mkdirSync(path.dirname(html), { recursive: true });
    fs.writeFileSync(html, page, "utf8");
  }
  out({ mensajes_listos: links.length, sin_telefono: sinTelefono, archivo_html: html ?? null, nota: "Los mensajes NO se envían solos: Majo da clic en cada link.", ejemplos: links.slice(0, 3) });
}

function newestBackstageExport() {
  const dir = path.join(os.homedir(), "Downloads");
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^Datos del creador.*\.xlsx$/i.test(f))
    .map((f) => ({ file: path.join(dir, f), mtime: fs.statSync(path.join(dir, f)).mtime }))
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  return files[0];
}

async function actualizarDatos() {
  const chosen = str("archivo") ? { file: str("archivo")!, mtime: fs.statSync(str("archivo")!).mtime } : newestBackstageExport();
  if (!chosen) fail('No encontré ningún Excel "Datos del creador….xlsx" en Descargas. Pídele a Majo que lo descargue de Backstage.');
  const book = XLSX.read(fs.readFileSync(chosen.file), { type: "buffer" });
  const sheet = book.Sheets[book.SheetNames[0]!];
  const parsed = parseBackstageSheet(XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" }));
  if (!parsed.ok) fail(parsed.error);
  const p = str("periodo") ?? period();

  // ¿El archivo es de esta agencia? Se compara contra los creadores de cada agencia.
  const nicks = new Set(parsed.rows.map((r) => clean(r.username)));
  const matchCount = async (slug: string) => {
    const cs = await prisma.creator.findMany({ where: { agencySlug: slug }, select: { name: true, tiktokUser: true } });
    return cs.filter((c) => nicks.has(clean(c.name)) || (c.tiktokUser && nicks.has(clean(c.tiktokUser)))).length;
  };
  const matches = Object.fromEntries(await Promise.all(Object.keys(AGENCIES).map(async (s) => [s, await matchCount(s)] as const)));
  const best = Object.entries(matches).sort((a, b) => b[1] - a[1])[0];
  if (best[0] !== agencySlug && best[1] > (matches[agencySlug] ?? 0)) {
    fail(`Este Excel parece ser de ${AGENCIES[best[0] as AgencySlug].shortName} (${best[1]} creadores coinciden) y no de ${AGENCIES[agencySlug].shortName} (${matches[agencySlug]}). No lo importo.`);
  }

  const last = await prisma.diamondImportLog.findFirst({ where: { agencySlug, period: p }, orderBy: { createdAt: "desc" } });
  if (last && chosen.mtime < last.createdAt && !flag("forzar")) {
    fail(
      `El archivo (${chosen.mtime.toISOString()}) es MÁS VIEJO que la última carga del panel (${last.createdAt.toISOString()}). Importarlo regresaría los números. Pide a Majo un Excel nuevo de Backstage (o usa --forzar si ella lo pide).`
    );
  }

  const current = await prisma.diamondControl.aggregate({ where: { agencySlug, period: p }, _sum: { diamonds: true }, _count: true });
  const info = {
    archivo: path.basename(chosen.file),
    descargado: chosen.mtime.toISOString(),
    agencia: AGENCIES[agencySlug].shortName,
    mes: p,
    usuarios_en_excel: parsed.rows.length,
    diamantes_en_excel: parsed.rows.reduce((a, r) => a + r.diamantes, 0),
    diamantes_en_panel_ahora: current._sum.diamonds ?? 0,
    columnas: parsed.columns,
  };
  if (!confirm) return preview("Importar este Excel a Control de diamantes y correr el robot (crea tareas del día y de contacto).", info);

  const s = await importDiamondRows(agencySlug, p, parsed.rows, { userId: null, userName: ACTOR, filename: path.basename(chosen.file), runRobotAfter: true });
  out({
    hecho: true,
    ...info,
    importados: s.upserted,
    diamantes_antes: s.diamondsBefore,
    diamantes_ahora: s.diamondsAfter,
    mas_subieron: s.topGainers.slice(0, 5),
    empezaron_live: s.startedLive,
    salieron_de_riesgo_o_sin_live: s.leftRisk,
    no_estan_en_creadores: s.notInRoster,
    robot_antes: s.riskBefore,
    robot_ahora: s.riskAfter,
    robot: s.robot,
  });
}

async function robot() {
  if (!confirm) {
    const r = await buildRobotReport(agencySlug);
    return preview("Correr el robot: tareas fijas del día + una tarea de contacto por manager con sus creadores en riesgo.", {
      creadores_marcados: r.creators.length,
    });
  }
  const r = await runRobot(agencySlug);
  out({ hecho: true, tareas_de_contacto: r.managerTasksCreated, tareas_fijas: r.tasksCreated });
}

async function crearTarea() {
  const titulo = str("titulo") ?? fail("Falta --titulo");
  const prioridad = str("prioridad") ?? "media";
  if (!["baja", "media", "alta"].includes(prioridad)) fail("--prioridad debe ser baja, media o alta");
  const fecha = str("fecha") ?? todayKey();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) fail("--fecha debe ser YYYY-MM-DD");
  const assignee = str("asignar") ? await findUser(str("asignar")!) : null;
  const creator = str("creador") ? await findCreator(str("creador")!) : null;
  const info = { titulo, asignada_a: assignee?.name ?? "sin asignar", creador: creator?.name ?? null, prioridad, fecha, descripcion: str("descripcion") ?? null };
  if (!confirm) return preview("Crear esta tarea en el panel.", info);
  await prisma.task.create({
    data: {
      agencySlug,
      title: titulo,
      description: [str("descripcion"), `Creada por ${ACTOR} con aprobación de Majo.`].filter(Boolean).join("\n\n"),
      assigneeId: assignee?.id ?? null,
      creatorId: creator?.id ?? null,
      priority: prioridad,
      status: "pendiente",
      period: fecha.slice(0, 7),
      dueDate: new Date(`${fecha}T00:00:00.000Z`),
    },
  });
  out({ hecho: true, ...info });
}

async function nota() {
  const c = await findCreator(str("creador") ?? fail("Falta --creador"));
  const texto = str("texto") ?? fail("Falta --texto");
  if (!confirm) return preview(`Agregar una nota a ${c.name}.`, { nota: texto });
  await prisma.creatorNote.create({ data: { creatorId: c.id, authorId: null, authorName: ACTOR, body: texto } });
  out({ hecho: true, creador: c.name, nota: texto });
}

async function asignarManager() {
  const c = await findCreator(str("creador") ?? fail("Falta --creador"));
  const m = await findUser(str("manager") ?? fail("Falta --manager"));
  if (!confirm) return preview(`Cambiar el manager de ${c.name}: ${c.manager?.name ?? "nadie"} → ${m.name}.`);
  await prisma.creator.update({ where: { id: c.id }, data: { managerId: m.id } });
  out({ hecho: true, creador: c.name, antes: c.manager?.name ?? null, ahora: m.name });
}

const COMMANDS: Record<string, () => Promise<unknown>> = {
  resumen,
  buscar,
  creador,
  equipo,
  tareas,
  whatsapp,
  "actualizar-datos": actualizarDatos,
  robot,
  "crear-tarea": crearTarea,
  nota,
  "asignar-manager": asignarManager,
};

async function main() {
  const fn = cmd ? COMMANDS[cmd] : undefined;
  if (!fn) {
    out(`Comandos: ${Object.keys(COMMANDS).join(", ")}. Lee el encabezado de scripts/oficina.ts para las opciones.`);
    process.exit(cmd ? 1 : 0);
  }
  await fn();
  await prisma.$disconnect();
}

main().catch((e) => {
  console.log(`ERROR: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
