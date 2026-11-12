import { DIAMOND_TIERS, HOURS_TIERS, INCORP2_TIERS, KIND_LABEL, LEVEL_LABEL, payoutMode, type BonusKind, type Level, type Tier } from "@/lib/level-bonuses";
import { MESES_NOMBRE } from "@/lib/bonos";

export type InvoiceAward = {
  id: string;
  period: string;
  kind: BonusKind;
  tier: string;
  level: Level;
  coins: number;
  usd: number | null;
  advisory: boolean;
  status: string;
  method: string | null;
  scheduledFor: string | null;
  paidAt: string | null;
  note: string | null;
  metrics: { diamonds: number; days: number; hours: number } | null;
};
export type InvoiceData = { username: string; creatorName: string | null; joinDate: string | null; awards: InvoiceAward[] };

const TIERS: Record<BonusKind, Tier[]> = { horas: HOURS_TIERS, diamantes: DIAMOND_TIERS, incorporacion2: INCORP2_TIERS };
const STATUS: Record<string, string> = { calculado: "Por pagar", programado: "Programado", pagado: "Pagado", acumulado: "Acumulado" };
const METHOD: Record<string, string> = { batalla: "Batalla agendada", live_normal: "LIVE normal", tiktok_shop: "TikTok Shop", transferencia: "Transferencia bancaria" };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const n = (v: number) => v.toLocaleString("en-US");
const monthName = (p: string) => `${MESES_NOMBRE[Number(p.slice(5))]} ${p.slice(0, 4)}`;
const amount = (a: { coins: number; usd: number | null; advisory: boolean }) =>
  a.advisory ? "Asesoría personalizada" : a.usd != null ? `${a.usd} USD (${n(a.coins)} monedas)` : `${n(a.coins)} monedas`;

/** Explica por qué se paga ese monto: la categoría alcanzada y lo que se logró contra lo que se pedía. */
function reason(a: InvoiceAward) {
  const t = TIERS[a.kind].find((x) => x.name === a.tier);
  const m = a.metrics;
  const edited = a.note?.startsWith("Editado a mano");
  const head = `${KIND_LABEL[a.kind]}, categoría ${a.tier} (Nivel ${a.level} · ${LEVEL_LABEL[a.level]}), ${monthName(a.period)}.`;
  if (!t) return `${head} Monto ajustado a mano por la agencia.`;
  const need = `Requisitos: ${t.days} días, ${t.hours} horas y ${n(t.diamonds)} diamantes como mínimo, los tres a la vez.`;
  const got = m ? ` Logró: ${m.days} días, ${m.hours} horas y ${n(m.diamonds)} diamantes.` : " Métricas del mes no disponibles.";
  return `${head} ${need}${got}${edited ? " Monto ajustado a mano por la agencia." : ""}`;
}

/** Abre una factura imprimible (o para guardar como PDF) con los bonos del creador. */
export function openInvoice(data: InvoiceData, opts: { includePaid: boolean }) {
  const list = data.awards.filter((a) => opts.includePaid || a.status !== "pagado");
  const totalCoins = list.filter((a) => !a.advisory).reduce((s, a) => s + a.coins, 0);
  const totalUsd = list.reduce((s, a) => s + (a.usd ?? 0), 0);
  const today = new Date().toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });
  const levels = [...new Set(list.map((a) => a.level))];

  const rows = list
    .map(
      (a, i) => `<tr>
        <td>${i + 1}</td>
        <td><b>${esc(KIND_LABEL[a.kind])} · ${esc(a.tier)}</b><div class="why">${esc(reason(a))}</div></td>
        <td>${esc(monthName(a.period))}</td>
        <td>${esc(STATUS[a.status] ?? a.status)}${a.method ? `<div class="why">${esc(METHOD[a.method] ?? a.method)}</div>` : ""}${a.scheduledFor ? `<div class="why">Fecha: ${esc(a.scheduledFor)}</div>` : ""}</td>
        <td class="r"><b>${esc(amount(a))}</b></td>
      </tr>`
    )
    .join("");

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Factura de bonos @${esc(data.username)}</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:32px auto;max-width:820px;padding:0 20px;font-size:13px}
  h1{font-size:22px;margin:0}.sub{color:#555;margin:2px 0 18px}
  .box{border:1px solid #ccc;border-radius:8px;padding:12px 14px;margin-bottom:16px;display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}
  table{width:100%;border-collapse:collapse}th{text-align:left;font-size:11px;text-transform:uppercase;color:#555;border-bottom:2px solid #111;padding:6px}
  td{padding:8px 6px;border-bottom:1px solid #ddd;vertical-align:top}.r{text-align:right;white-space:nowrap}.why{color:#555;font-size:11px;margin-top:3px}
  .total{margin-top:14px;text-align:right;font-size:15px}.note{margin-top:20px;color:#555;font-size:11px;line-height:1.5}
  button{margin-bottom:16px;padding:8px 14px;font-size:13px;cursor:pointer}@media print{button{display:none}body{margin:0}}
</style></head><body>
<button onclick="window.print()">Imprimir / Guardar PDF</button>
<h1>Estado de bonos por niveles</h1>
<p class="sub">Agencia El Árbol · Emitido el ${esc(today)}</p>
<div class="box">
  <div><b>${esc(data.creatorName ?? "@" + data.username)}</b><br>@${esc(data.username)}${data.joinDate ? `<br>Ingreso a la agencia: ${esc(data.joinDate)}` : ""}</div>
  <div>${levels.length ? `Liga: Nivel ${esc(levels.join(", "))}<br>` : ""}${levels.length ? `Forma de pago: ${esc(payoutMode(levels[levels.length - 1]))}` : ""}</div>
</div>
${
  list.length
    ? `<table><thead><tr><th>#</th><th>Concepto y motivo</th><th>Mes</th><th>Estado</th><th class="r">Monto</th></tr></thead><tbody>${rows}</tbody></table>
<p class="total">Total: <b>${n(totalCoins)} monedas${totalUsd ? ` · ${n(Math.round(totalUsd * 100) / 100)} USD` : ""}</b></p>`
    : `<p>No hay bonos ${opts.includePaid ? "guardados" : "pendientes de pago"} para este creador.</p>`
}
<p class="note">Cada bono se paga por alcanzar a la vez los días, horas y diamantes mínimos de su categoría en el mes indicado. El nivel decide qué bonos aplican. Los pagos comienzan después del día 8 de cada mes; lo que no se paga se acumula al siguiente periodo.</p>
</body></html>`;

  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  return true;
}
