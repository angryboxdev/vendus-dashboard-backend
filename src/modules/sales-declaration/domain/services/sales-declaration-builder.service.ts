import { InvalidSalesDeclarationRequestError } from "../errors.js";
import type { DailySales, IsoDate, SaftSalesData, SalesDeclarationRow } from "../entities/sales-declaration.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

function toUtcMs(date: IsoDate): number {
  const ms = Date.parse(`${date}T00:00:00Z`);
  if (!ISO_DATE.test(date) || Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== date) {
    throw new InvalidSalesDeclarationRequestError(`Data inválida "${date}" (use YYYY-MM-DD)`);
  }
  return ms;
}

/** Todos os dias de `since` a `until`, inclusive. Lança se as datas forem inválidas ou invertidas. */
export function enumerateDays(since: IsoDate, until: IsoDate): IsoDate[] {
  const start = toUtcMs(since);
  const end = toUtcMs(until);
  if (end < start) {
    throw new InvalidSalesDeclarationRequestError("A data final não pode ser anterior à data inicial");
  }
  const count = (end - start) / DAY_MS + 1;
  return Array.from({ length: count }, (_, i) => new Date(start + i * DAY_MS).toISOString().slice(0, 10));
}

/**
 * Junta os SAF-T: cada documento conta uma só vez (pelo número — enviar o mesmo
 * ficheiro duas vezes não duplica valores) e é somado no seu dia.
 */
export function mergeSaftSales(files: SaftSalesData[]): DailySales[] {
  const seen = new Set<string>();
  const totals = new Map<IsoDate, number>();
  for (const file of files) {
    for (const doc of file.documents) {
      if (seen.has(doc.number)) continue;
      seen.add(doc.number);
      totals.set(doc.date, (totals.get(doc.date) ?? 0) + doc.netCents);
    }
  }
  return Array.from(totals, ([date, netCents]) => ({ date, netCents }));
}

/**
 * Período da declaração: do início ao fim declarados nos cabeçalhos dos SAF-T,
 * alargado para incluir qualquer documento fora deles. `null` se não houver datas.
 */
export function declarationPeriod(files: SaftSalesData[]): { since: IsoDate; until: IsoDate } | null {
  const dates: IsoDate[] = files.flatMap((f) => [
    ...(f.startDate ? [f.startDate] : []),
    ...(f.endDate ? [f.endDate] : []),
    ...f.documents.map((d) => d.date),
  ]);
  if (dates.length === 0) return null;
  const sorted = [...dates].sort();
  return { since: sorted[0]!, until: sorted[sorted.length - 1]! };
}

/** Uma linha por dia do período; dias sem movimento ficam a 0. */
export function buildSalesDeclarationRows(since: IsoDate, until: IsoDate, sales: DailySales[]): SalesDeclarationRow[] {
  const totals = new Map<IsoDate, number>(enumerateDays(since, until).map((d) => [d, 0]));
  for (const { date, netCents } of sales) {
    totals.set(date, (totals.get(date) ?? 0) + netCents);
  }
  return Array.from(totals, ([date, normalCents]) => ({ date, normalCents }));
}
