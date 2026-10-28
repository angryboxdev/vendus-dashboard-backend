import { computedPayoutCents, type PlatformStatement, type StatementLine } from "../entities/platform-statement.js";
import { parseCsv } from "./csv.js";
import { parseAmountCents } from "./text-amounts.js";

const COLUMNS = {
  date: "Order Create Date",
  status: "Finished Order Status",
  payment: "Payment Method Type",
  gross: "Order Total Gross",
} as const;

/** Relatório de pedidos da Bolt Food (CSV `…_orders_report_…`). */
export function isBoltOrdersReport(text: string): boolean {
  const header = text.replace(/^﻿/, "").split(/\r?\n/, 1)[0] ?? "";
  return header.includes("Order Reference ID") && header.includes(COLUMNS.gross) && header.includes(COLUMNS.status);
}

const dayLabel = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/**
 * Vendas por dia dos pedidos entregues (total bruto, com IVA). Lê só a data, o estado, o método de
 * pagamento e o valor — nunca morada, avaliação nem comentários. Pedidos pagos em dinheiro entram como
 * `cash` (o estafeta recebeu). Pedidos não entregues não contam.
 */
export function parseBoltOrdersReport(text: string): PlatformStatement | { error: string } {
  const [header, ...rows] = parseCsv(text);
  if (!header) return { error: "relatório vazio" };
  const col = Object.fromEntries(Object.entries(COLUMNS).map(([k, name]) => [k, header.indexOf(name)])) as Record<keyof typeof COLUMNS, number>;
  if (Object.values(col).some((i) => i < 0)) return { error: "faltam colunas do relatório de pedidos" };

  const byDay = new Map<string, { orders: number; sales: number; cash: number }>();
  for (const r of rows) {
    if ((r[col.status] ?? "").trim().toLowerCase() !== "delivered") continue;
    const date = (r[col.date] ?? "").trim();
    const gross = parseAmountCents((r[col.gross] ?? "").trim());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || gross === null) return { error: `pedido com data ou valor inválido (${date || "sem data"})` };
    const d = byDay.get(date) ?? { orders: 0, sales: 0, cash: 0 };
    d.orders++;
    d.sales += gross;
    if ((r[col.payment] ?? "").trim().toLowerCase() === "cash") d.cash += gross;
    byDay.set(date, d);
  }
  if (byDay.size === 0) return { error: "sem pedidos entregues" };

  const days = [...byDay.keys()].sort();
  const lines: StatementLine[] = days.flatMap((date) => {
    const d = byDay.get(date)!;
    const own: StatementLine[] = [{ kind: "sales", label: `Vendas ${dayLabel(date)} (${d.orders} pedido${d.orders === 1 ? "" : "s"})`, grossCents: d.sales, vatCents: 0, date }];
    if (d.cash > 0) own.push({ kind: "cash", label: `Pagos em dinheiro ${dayLabel(date)}`, grossCents: d.cash, vatCents: 0, date });
    return own;
  });
  const periodFrom = days[0]!;
  const periodTo = days[days.length - 1]!;
  const statement: PlatformStatement = {
    platform: "bolt_food",
    documentKind: "bolt_orders_report",
    documentNumber: `PEDIDOS-${periodFrom}-${periodTo}`,
    periodFrom,
    periodTo,
    issuedOn: null,
    ordersCount: [...byDay.values()].reduce((a, d) => a + d.orders, 0),
    lines,
    payouts: [],
    netPayoutCents: 0,
  };
  return { ...statement, netPayoutCents: computedPayoutCents(statement) };
}
