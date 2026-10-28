import { computedPayoutCents, type PlatformStatement, type StatementLine } from "../entities/platform-statement.js";

/** SAF-T PT de vendas (o do back-office do AirMenu). */
export function isSaftSales(text: string): boolean {
  return /<AuditFile[\s>]/.test(text) && /<SalesInvoices>/.test(text);
}

const tag = (block: string, name: string) => block.match(new RegExp(`<${name}>\\s*([^<]*?)\\s*</${name}>`))?.[1] ?? null;
const cents = (raw: string | null) => (raw !== null && Number.isFinite(Number(raw)) ? Math.round(Number(raw) * 100) : null);
const dayLabel = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Diferença tolerada entre a soma dos documentos e os totais do SAF-T (arredondamento por documento). */
const TOTALS_TOLERANCE_CENTS = 5;

/**
 * Faturado por dia (com IVA e o IVA exato) e notas de crédito por dia, das três plataformas juntas.
 * Documentos anulados não contam. Confere a soma dos valores sem IVA com `TotalCredit` / `TotalDebit` do
 * próprio ficheiro. Nunca guarda clientes nem artigos.
 */
export function parseSaftSales(text: string): PlatformStatement | { error: string } {
  const header = text.match(/<Header>[\s\S]*?<\/Header>/)?.[0] ?? "";
  if (/vendus/i.test(tag(header, "ProductID") ?? "")) return { error: "é o SAF-T do Vendus (restaurante); envie o SAF-T do AirMenu (delivery)" };
  const section = text.match(/<SalesInvoices>[\s\S]*?<\/SalesInvoices>/)?.[0];
  if (!section) return { error: "SAF-T sem vendas" };

  const byDay = new Map<string, { docs: number; gross: number; vat: number; ncGross: number; ncVat: number }>();
  let netInvoices = 0;
  let netCredits = 0;
  for (const [invoice] of section.matchAll(/<Invoice>[\s\S]*?<\/Invoice>/g)) {
    if (tag(invoice, "InvoiceStatus") === "A") continue;
    const date = tag(invoice, "InvoiceDate");
    const gross = cents(tag(invoice, "GrossTotal"));
    const net = cents(tag(invoice, "NetTotal"));
    const vat = cents(tag(invoice, "TaxPayable"));
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || gross === null || net === null || vat === null) {
      return { error: `documento inválido (${tag(invoice, "InvoiceNo") ?? "sem número"})` };
    }
    const d = byDay.get(date) ?? { docs: 0, gross: 0, vat: 0, ncGross: 0, ncVat: 0 };
    if (tag(invoice, "InvoiceType") === "NC") {
      d.ncGross += gross;
      d.ncVat += vat;
      netCredits += net;
    } else {
      d.docs++;
      d.gross += gross;
      d.vat += vat;
      netInvoices += net;
    }
    byDay.set(date, d);
  }
  if (byDay.size === 0) return { error: "SAF-T sem documentos de venda" };

  const totalCredit = cents(tag(section, "TotalCredit"));
  const totalDebit = cents(tag(section, "TotalDebit"));
  if (totalCredit !== null && Math.abs(totalCredit - netInvoices) > TOTALS_TOLERANCE_CENTS) {
    return { error: `os documentos não somam o TotalCredit do SAF-T (${netInvoices} × ${totalCredit} cêntimos)` };
  }
  if (totalDebit !== null && Math.abs(totalDebit - netCredits) > TOTALS_TOLERANCE_CENTS) {
    return { error: `as notas de crédito não somam o TotalDebit do SAF-T (${netCredits} × ${totalDebit} cêntimos)` };
  }

  const days = [...byDay.keys()].sort();
  const lines: StatementLine[] = days.flatMap((date) => {
    const d = byDay.get(date)!;
    const own: StatementLine[] = [];
    if (d.docs > 0) own.push({ kind: "sales", label: `Faturado ${dayLabel(date)} (${d.docs} doc.)`, grossCents: d.gross, vatCents: d.vat, date });
    if (d.ncGross !== 0) own.push({ kind: "refund", label: `Notas de crédito ${dayLabel(date)}`, grossCents: d.ncGross, vatCents: d.ncVat, date });
    return own;
  });
  const periodFrom = tag(header, "StartDate") ?? days[0]!;
  const periodTo = tag(header, "EndDate") ?? days[days.length - 1]!;
  const statement: PlatformStatement = {
    platform: "airmenu",
    documentKind: "airmenu_saft",
    documentNumber: `SAFT-${periodFrom}-${periodTo}`,
    periodFrom,
    periodTo,
    issuedOn: null,
    ordersCount: [...byDay.values()].reduce((a, d) => a + d.docs, 0),
    lines,
    payouts: [],
    netPayoutCents: 0,
  };
  return { ...statement, netPayoutCents: computedPayoutCents(statement) };
}
