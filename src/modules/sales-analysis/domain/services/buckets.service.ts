import type { AirMenuChannel, IsoDate, SalesBucket, SalesChannel, VendusChannel } from "../entities/sales-analysis.js";

/**
 * Conversão de documentos/encomendas em blocos (dia × hora × canal).
 * Funções puras: os adapters entregam já a data e a hora de Lisboa.
 */

/** Documento Vendus reduzido ao que a análise precisa. */
export interface VendusSaleInput {
  type: string; // FS | FT | NC
  date: IsoDate;
  hour: number;
  channel: VendusChannel;
  grossCents: number; // sempre positivo, como vem da Vendus
  netCents: number;
}

/** Encomenda AirMenu reduzida (o total das NC vem negativo ou positivo; usa-se o valor absoluto). */
export interface AirMenuSaleInput {
  date: IsoDate;
  hour: number;
  channel: AirMenuChannel;
  grossCents: number;
  netCents: number;
  isCreditNote: boolean;
}

type Acc = Map<string, SalesBucket>;

function add(acc: Acc, date: IsoDate, hour: number, channel: SalesChannel, gross: number, net: number, count: number) {
  const k = `${date}|${hour}|${channel}`;
  const b = acc.get(k) ?? { date, hour, channel, grossCents: 0, netCents: 0, count: 0 };
  b.grossCents += gross;
  b.netCents += net;
  b.count += count;
  acc.set(k, b);
}

/**
 * FS/FT somam; cada NC subtrai o seu valor e uma venda, no dia e hora em que foi emitida
 * (a mesma regra da receita bruta do Resultados: bruto com IVA, líquido de notas de crédito).
 */
export function vendusToBuckets(docs: VendusSaleInput[]): SalesBucket[] {
  const acc: Acc = new Map();
  for (const d of docs) {
    if (d.type === "FS" || d.type === "FT") add(acc, d.date, d.hour, d.channel, d.grossCents, d.netCents, 1);
    else if (d.type === "NC") add(acc, d.date, d.hour, d.channel, -Math.abs(d.grossCents), -Math.abs(d.netCents), -1);
  }
  return sortBuckets([...acc.values()]);
}

export function airMenuToBuckets(orders: AirMenuSaleInput[]): SalesBucket[] {
  const acc: Acc = new Map();
  for (const o of orders) {
    const g = Math.abs(o.grossCents);
    const n = Math.abs(o.netCents);
    if (o.isCreditNote) add(acc, o.date, o.hour, o.channel, -g, -n, -1);
    else add(acc, o.date, o.hour, o.channel, g, n, 1);
  }
  return sortBuckets([...acc.values()]);
}

export function sortBuckets(b: SalesBucket[]): SalesBucket[] {
  return b.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : x.hour - y.hour || x.channel.localeCompare(y.channel)));
}

/** Total de cada dia por canal (hora = −1). Usado nas comparações, que não precisam da hora. */
export function dailyByChannel(buckets: SalesBucket[]): SalesBucket[] {
  const acc: Acc = new Map();
  for (const b of buckets) add(acc, b.date, -1, b.channel, b.grossCents, b.netCents, b.count);
  return sortBuckets([...acc.values()]);
}

/** Total por dia (todos os canais). */
export function dailyTotals(buckets: SalesBucket[]): Map<IsoDate, { grossCents: number; count: number }> {
  const m = new Map<IsoDate, { grossCents: number; count: number }>();
  for (const b of buckets) {
    const e = m.get(b.date) ?? { grossCents: 0, count: 0 };
    e.grossCents += b.grossCents;
    e.count += b.count;
    m.set(b.date, e);
  }
  return m;
}
