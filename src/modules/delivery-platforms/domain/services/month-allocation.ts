import type { AllocatedDocument, AllocationBasis } from "../entities/margin-report.js";
import type { StatementLine } from "../entities/platform-statement.js";
import type { StoredPlatformStatement } from "../ports/out/platform-statement-repository.port.js";

/** Dias de `from` a `to` (YYYY-MM-DD, inclusive). */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

const inRange = (day: string, from: string, to: string) => day >= from && day <= to;

/** Vendas por dia de documentos com linhas datadas, e os dias que esses documentos cobrem. */
function dailyWeights(docs: StoredPlatformStatement[]): { weight: Map<string, number>; covered: Set<string> } {
  const weight = new Map<string, number>();
  const covered = new Set<string>();
  for (const d of docs) {
    for (const day of daysBetween(d.periodFrom, d.periodTo)) covered.add(day);
    for (const l of d.lines) if (l.kind === "sales" && l.date) weight.set(l.date, (weight.get(l.date) ?? 0) + l.grossCents);
  }
  return { weight, covered };
}

export interface AllocatedStatement {
  statement: StoredPlatformStatement;
  /** Linhas já só com a parte do mês. */
  lines: StatementLine[];
  ordersCount: number;
  netPayoutCents: number;
  meta: AllocatedDocument;
}

const scale = (v: number, share: number) => Math.round(v * share);

/**
 * Parte de cada documento que pertence ao mês. Um documento que traz os dias conta só os dias do mês;
 * os outros (quinzena da Glovo, semana da Bolt) repartem-se pelo peso diário — vendas do relatório de
 * pedidos da Bolt (só para a Bolt), senão o faturado diário do SAF-T, senão a proporção de dias.
 * `context` são todos os documentos à volta do mês (SAF-T e relatórios da Bolt dos meses vizinhos).
 */
export function allocateToMonth(
  statements: StoredPlatformStatement[],
  context: StoredPlatformStatement[],
  from: string,
  to: string,
): AllocatedStatement[] {
  const saft = dailyWeights(context.filter((d) => d.documentKind === "airmenu_saft"));
  const boltOrders = dailyWeights(context.filter((d) => d.documentKind === "bolt_orders_report"));

  return statements
    .map((s): AllocatedStatement => {
      const meta = (share: number, basis: AllocationBasis): AllocatedDocument => ({
        platform: s.platform,
        documentKind: s.documentKind,
        documentNumber: s.documentNumber,
        periodFrom: s.periodFrom,
        periodTo: s.periodTo,
        share,
        basis,
      });
      if (s.periodFrom >= from && s.periodTo <= to) {
        return { statement: s, lines: s.lines, ordersCount: s.ordersCount ?? 0, netPayoutCents: s.netPayoutCents, meta: meta(1, "month") };
      }
      const dated = s.lines.some((l) => l.date);
      if (dated) {
        const lines = s.lines.filter((l) => !l.date || inRange(l.date, from, to));
        const sales = (ls: StatementLine[]) => ls.filter((l) => l.kind === "sales").reduce((a, l) => a + l.grossCents, 0);
        const share = sales(s.lines) > 0 ? sales(lines) / sales(s.lines) : 0;
        const net = lines.reduce((a, l) => (l.kind === "sales" ? a + l.grossCents : a - l.grossCents), 0);
        return { statement: s, lines, ordersCount: scale(s.ordersCount ?? 0, share), netPayoutCents: net, meta: meta(share, "daily") };
      }
      const days = daysBetween(s.periodFrom, s.periodTo);
      const byWeights = (w: { weight: Map<string, number>; covered: Set<string> }): number | null => {
        if (!days.every((d) => w.covered.has(d))) return null;
        const total = days.reduce((a, d) => a + (w.weight.get(d) ?? 0), 0);
        if (total <= 0) return null;
        return days.filter((d) => inRange(d, from, to)).reduce((a, d) => a + (w.weight.get(d) ?? 0), 0) / total;
      };
      const fromOrders = s.platform === "bolt_food" ? byWeights(boltOrders) : null;
      const fromSaft = fromOrders === null ? byWeights(saft) : null;
      const [share, basis]: [number, AllocationBasis] =
        fromOrders !== null
          ? [fromOrders, "orders"]
          : fromSaft !== null
            ? [fromSaft, "saft"]
            : [days.filter((d) => inRange(d, from, to)).length / days.length, "days"];
      return {
        statement: s,
        lines: s.lines.map((l) => ({ ...l, grossCents: scale(l.grossCents, share), vatCents: scale(l.vatCents, share) })),
        ordersCount: scale(s.ordersCount ?? 0, share),
        netPayoutCents: scale(s.netPayoutCents, share),
        meta: meta(share, basis),
      };
    })
    .filter((a) => a.meta.share > 0);
}
