import {
  findColumnIndex,
  parseLiveDurationHours,
  parseNumericCell,
  resolveTikTokExportColumns,
} from "@/lib/bonos";

/**
 * Lectura del Excel exportado de TikTok LIVE Backstage.
 * Es la MISMA lógica que usa Control de diamantes (mismas columnas y formatos),
 * pero sin depender del navegador: recibe las filas ya leídas con XLSX.
 */

export type BackstageRow = { username: string; diamantes: number; horas: number; dias: number };

export type ParsedBackstage =
  | { ok: true; rows: BackstageRow[]; columns: { user: string; diamonds: string; hours: string; days: string } }
  | { ok: false; error: string };

export function parseBackstageSheet(sheetRows: unknown[][]): ParsedBackstage {
  if (!sheetRows || sheetRows.length < 2) return { ok: false, error: "El Excel no tiene encabezados o filas." };

  // Si la fila 0 no trae encabezados útiles, probar la fila 1 (título arriba)
  const probe = (idx: number) => (sheetRows[idx] ?? []).map((h) => String(h ?? ""));
  let headerRowIdx = 0;
  let headers = probe(0);
  if (findColumnIndex(headers, ["diamantes", "diamonds"]) < 0 && sheetRows.length > 2) {
    const h1 = probe(1);
    if (findColumnIndex(h1, ["diamantes", "diamonds"]) >= 0) {
      headers = h1;
      headerRowIdx = 1;
    }
  }

  const { iUser, iDm, iH, iD } = resolveTikTokExportColumns(headers);
  if (iUser < 0 || iDm < 0) return { ok: false, error: "No encontré las columnas de usuario o diamantes. ¿Es el Excel de Backstage?" };
  if (iH < 0 || iD < 0) {
    return { ok: false, error: `Faltan las columnas de duración LIVE o días válidos. Encabezados: ${headers.filter(Boolean).slice(0, 16).join(" · ")}` };
  }
  if (new Set([iUser, iDm, iH, iD]).size < 4) {
    return { ok: false, error: `Columnas duplicadas: ${[headers[iUser], headers[iDm], headers[iH], headers[iD]].join(" | ")}` };
  }

  const rows: BackstageRow[] = [];
  for (let r = headerRowIdx + 1; r < sheetRows.length; r++) {
    const row = sheetRows[r];
    if (!Array.isArray(row) || row.length === 0) continue;
    const username = String(row[iUser] ?? "").replace(/^@/, "").trim();
    if (!username) continue;
    rows.push({
      username,
      diamantes: Math.max(0, Math.floor(parseNumericCell(row[iDm]))),
      horas: Math.max(0, Math.round(parseLiveDurationHours(row[iH]) * 10) / 10),
      dias: Math.max(0, Math.floor(parseNumericCell(row[iD]))),
    });
  }
  if (!rows.length) return { ok: false, error: "El Excel no tiene usuarios reconocibles." };

  return { ok: true, rows, columns: { user: headers[iUser], diamonds: headers[iDm], hours: headers[iH], days: headers[iD] } };
}
