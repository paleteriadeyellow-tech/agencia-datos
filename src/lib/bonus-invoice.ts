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

const GREEN = "#1f7a4d";
const GREEN_DARK = "#0f3d2a";

/** Sello de la agencia: árbol al centro y el nombre en círculo. */
const SEAL = (size: number, color = GREEN) => `<svg width="${size}" height="${size}" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <defs><path id="c${size}" d="M100,100 m-72,0 a72,72 0 1,1 144,0 a72,72 0 1,1 -144,0"/></defs>
  <circle cx="100" cy="100" r="94" fill="none" stroke="${color}" stroke-width="4"/>
  <circle cx="100" cy="100" r="88" fill="none" stroke="${color}" stroke-width="1.2"/>
  <circle cx="100" cy="100" r="52" fill="none" stroke="${color}" stroke-width="1.2"/>
  <text font-family="Arial" font-weight="700" font-size="15" letter-spacing="3.2" fill="${color}"><textPath href="#c${size}" startOffset="0">AGENCIA EL ÁRBOL ★ LIVE CREATORS ★ </textPath></text>
  <rect x="94" y="112" width="12" height="30" rx="2" fill="${color}"/>
  <circle cx="100" cy="86" r="22" fill="${color}"/><circle cx="82" cy="102" r="15" fill="${color}"/><circle cx="118" cy="102" r="15" fill="${color}"/>
  <path d="M100 112 L100 96 M100 104 L90 94 M100 104 L110 94" stroke="#fff" stroke-width="2.4" stroke-linecap="round" fill="none"/>
</svg>`;

/** Abre una factura imprimible (o para guardar como PDF) con los bonos del creador. */
export function openInvoice(data: InvoiceData, opts: { includePaid: boolean }) {
  const list = data.awards.filter((a) => opts.includePaid || a.status !== "pagado");
  const totalCoins = list.filter((a) => !a.advisory).reduce((s, a) => s + a.coins, 0);
  const totalUsd = list.reduce((s, a) => s + (a.usd ?? 0), 0);
  const now = new Date();
  const today = now.toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });
  const folio = `EA-${data.username.slice(0, 10).toUpperCase()}-${now.toISOString().slice(0, 10).replace(/-/g, "")}`;
  const levels = [...new Set(list.map((a) => a.level))];
  const allPaid = list.length > 0 && list.every((a) => a.status === "pagado");
  const periods = [...new Set(list.map((a) => a.period))];

  const BADGE: Record<string, string> = { calculado: "#b45309", programado: "#1d4ed8", pagado: GREEN, acumulado: "#7c3aed" };
  const rows = list
    .map(
      (a, i) => `<tr>
        <td class="n">${i + 1}</td>
        <td><div class="t">${esc(KIND_LABEL[a.kind])} <span class="tier">${esc(a.tier)}</span></div><div class="why">${esc(reason(a))}</div></td>
        <td class="m">${esc(monthName(a.period))}</td>
        <td><span class="badge" style="background:${BADGE[a.status] ?? "#555"}">${esc(STATUS[a.status] ?? a.status)}</span>${a.method ? `<div class="why">${esc(METHOD[a.method] ?? a.method)}</div>` : ""}${a.scheduledFor ? `<div class="why">Fecha: ${esc(a.scheduledFor)}</div>` : ""}</td>
        <td class="r amt">${esc(amount(a))}</td>
      </tr>`
    )
    .join("");

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Factura de bonos @${esc(data.username)}</title>
<style>
  *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  body{font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;background:#eef2ef;margin:0;padding:24px;font-size:13px}
  .page{position:relative;max-width:860px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.12)}
  .wm{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);opacity:.05;pointer-events:none}
  .head{background:linear-gradient(135deg,${GREEN_DARK},${GREEN});color:#fff;padding:22px 28px;display:flex;align-items:center;gap:18px}
  .head .seal{background:#fff;border-radius:50%;padding:4px;line-height:0}
  .head h1{margin:0;font-size:24px;letter-spacing:.3px}.head .ag{font-size:11px;letter-spacing:3px;text-transform:uppercase;opacity:.85}
  .head .fol{margin-left:auto;text-align:right;font-size:11px;opacity:.95;line-height:1.6}.head .fol b{font-size:13px}
  .body{position:relative;padding:22px 28px 28px}
  .cards{display:grid;grid-template-columns:1.3fr 1fr;gap:14px;margin-bottom:18px}
  .card{border:1px solid #d7e3dc;border-left:5px solid ${GREEN};border-radius:8px;padding:12px 14px;background:#f7fbf8}
  .card .l{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#5b6b62}.card .v{font-size:15px;font-weight:700;margin:2px 0 4px}.card .s{color:#444;font-size:12px;line-height:1.6}
  table{width:100%;border-collapse:collapse;position:relative}
  th{background:${GREEN_DARK};color:#fff;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:1px;padding:8px 8px}
  td{padding:10px 8px;border-bottom:1px solid #e4ece7;vertical-align:top}tr:nth-child(even) td{background:#f7fbf8}
  .n{color:#7a8a81;width:24px}.t{font-weight:700;font-size:13px}.tier{display:inline-block;margin-left:6px;padding:1px 8px;border-radius:99px;background:#e3f3ea;color:${GREEN};font-size:11px;font-weight:700}
  .why{color:#566;font-size:11px;margin-top:4px;line-height:1.45}.m{white-space:nowrap}.r{text-align:right;white-space:nowrap}.amt{font-weight:700;font-size:14px;color:${GREEN_DARK}}
  .badge{display:inline-block;color:#fff;font-size:10px;font-weight:700;padding:3px 9px;border-radius:99px;text-transform:uppercase;letter-spacing:.5px}
  .sum{display:flex;justify-content:flex-end;align-items:center;gap:22px;margin-top:18px}
  .tot{background:${GREEN_DARK};color:#fff;border-radius:10px;padding:12px 20px;text-align:right}.tot .l{font-size:10px;letter-spacing:1px;text-transform:uppercase;opacity:.8}.tot .v{font-size:20px;font-weight:700}
  .stamp{border:4px double ${allPaid ? GREEN : "#c2410c"};color:${allPaid ? GREEN : "#c2410c"};font-weight:800;font-size:20px;letter-spacing:2px;padding:6px 16px;border-radius:8px;transform:rotate(-8deg);opacity:.85;text-transform:uppercase}
  .foot{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;margin-top:30px}
  .sign{flex:1;text-align:center;font-size:11px;color:#566}.sign .line{border-top:1px solid #333;margin:0 18px 6px;padding-top:6px;font-weight:700;color:#222}
  .note{margin-top:20px;border-top:1px dashed #b9c9bf;padding-top:12px;color:#566;font-size:11px;line-height:1.55}
  .bar{height:6px;background:repeating-linear-gradient(90deg,${GREEN} 0 24px,${GREEN_DARK} 24px 48px)}
  button{display:block;margin:0 auto 16px;padding:9px 18px;font-size:13px;cursor:pointer;border:0;border-radius:6px;background:${GREEN};color:#fff;font-weight:700}
  @media print{body{background:#fff;padding:0}button{display:none}.page{box-shadow:none;border-radius:0}}
</style></head><body>
<button onclick="window.print()">Imprimir / Guardar PDF</button>
<div class="page">
  <div class="wm">${SEAL(520)}</div>
  <div class="head">
    <div class="seal">${SEAL(78)}</div>
    <div><div class="ag">Agencia El Árbol</div><h1>Estado de bonos por niveles</h1></div>
    <div class="fol">Folio<br><b>${esc(folio)}</b><br>${esc(today)}</div>
  </div>
  <div class="body">
    <div class="cards">
      <div class="card"><div class="l">Creador</div><div class="v">${esc(data.creatorName ?? "@" + data.username)}</div><div class="s">@${esc(data.username)}${data.joinDate ? `<br>Ingreso a la agencia: ${esc(data.joinDate)}` : ""}</div></div>
      <div class="card"><div class="l">Liga</div><div class="v">${levels.length ? `Nivel ${esc(levels.join(", "))}` : "—"}</div><div class="s">${levels.length ? esc(payoutMode(levels[levels.length - 1])) : ""}${periods.length ? `<br>Periodos: ${esc(periods.map(monthName).join(", "))}` : ""}</div></div>
    </div>
    ${
      list.length
        ? `<table><thead><tr><th>#</th><th>Concepto y motivo</th><th>Mes</th><th>Estado</th><th class="r">Monto</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="sum"><div class="stamp">${allPaid ? "Pagado" : "Por pagar"}</div><div class="tot"><div class="l">Total a pagar</div><div class="v">${n(totalCoins)} monedas${totalUsd ? ` · ${n(Math.round(totalUsd * 100) / 100)} USD` : ""}</div></div></div>`
        : `<p>No hay bonos ${opts.includePaid ? "guardados" : "pendientes de pago"} para este creador.</p>`
    }
    <div class="foot">
      <div class="sign"><div class="line">Agencia El Árbol</div>Autorizado por la administración</div>
      <div style="line-height:0">${SEAL(110)}</div>
      <div class="sign"><div class="line">@${esc(data.username)}</div>Recibí de conformidad</div>
    </div>
    <p class="note">Cada bono se paga por alcanzar a la vez los días, horas y diamantes mínimos de su categoría en el mes indicado; el nivel decide qué bonos aplican. Los pagos comienzan después del día 8 de cada mes y, lo que no se paga, se acumula al siguiente periodo.</p>
  </div>
  <div class="bar"></div>
</div>
</body></html>`;

  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  return true;
}
