import type { PlatformPayout, PlatformStatement, StatementLine } from "../entities/platform-statement.js";
import { amountAfterLabel, parseEnglishDate } from "./text-amounts.js";

/** As taxas, anúncios e ofertas da Uber Eats Portugal levam IVA a 23% (confirmado pelas faturas semanais). */
const UBER_FEES_VAT_PCT = 23;

/** Texto de um extrato mensal da Uber Eats («Resumo mensal consolidado» + «Pagamentos recebidos no mês»). */
export function isUberMonthlyStatement(text: string): boolean {
  return /Resumo mensal consolidado/i.test(text) && /Taxas Uber/i.test(text) && /Total l[íi]quido/i.test(text);
}

const vatOf = (grossCents: number) => grossCents - Math.round(grossCents / (1 + UBER_FEES_VAT_PCT / 100));

/**
 * Linhas de um bloco do extrato (o resumo do mês ou uma semana paga). Valores do documento: vendas
 * positivas, taxas negativas; aqui as reduções ficam positivas (ver `StatementLine`).
 */
function blockLines(block: string): { lines: StatementLine[]; orders: number | null } | null {
  const a = (label: string | RegExp) => amountAfterLabel(block, label) ?? 0;
  const salesLine = /^\s*Vendas \((\d+) Pedidos?\)/im.exec(block);
  if (!salesLine) return null;
  const fee = (kind: StatementLine["kind"], label: string, documentCents: number): StatementLine => ({
    kind,
    label,
    grossCents: -documentCents,
    vatCents: vatOf(-documentCents),
  });
  const lines = ([
    { kind: "sales", label: "Vendas", grossCents: a(/Vendas \(\d+ Pedidos?\)/), vatCents: 0 },
    { kind: "sales", label: "Gratificações", grossCents: a("Gratificações"), vatCents: 0 },
    { kind: "sales", label: "Taxas do recipiente", grossCents: a("Taxas do recipiente"), vatCents: 0 },
    { kind: "sales", label: "Outros rendimentos", grossCents: a("Outros rendimentos"), vatCents: 0 },
    { kind: "promotion", label: "Ofertas em artigos", grossCents: -a("Ofertas em artigos"), vatCents: 0 },
    fee("commission", "Taxas de mercado", a("Taxas de mercado")),
    fee("other_fee", "Outros débitos", a("Outros débitos")),
    fee("marketing", "Despesas com anúncios", a("Despesas com anúncios")),
    fee("marketing", "Créditos de anúncio", a("Créditos de anúncio")),
    fee("marketing", "Outras taxas da oferta", a("Outras taxas da oferta")),
    fee("marketing", "Ajuste de Marketing", a("Ajuste de Marketing")),
    { kind: "refund", label: "Estornos", grossCents: -a(/Montante l[íi]quido do estorno/), vatCents: 0 },
    { kind: "refund", label: "Ajustes", grossCents: -a(/Ajustes(?! de)/), vatCents: 0 },
  ] satisfies StatementLine[]).filter((l) => l.grossCents !== 0);
  return { lines, orders: Number(salesLine[1]) };
}

/**
 * Extrato mensal da Uber Eats (PDF): o resumo consolidado do mês civil dá as linhas do período; cada
 * página «Pagamentos recebidos no mês» dá uma transferência semanal (período, data e valor líquido).
 */
export function parseUberMonthlyStatement(text: string): PlatformStatement | { error: string } {
  // Só maiúsculas e algarismos (sem a flag `i`: senão a linha seguinte, «Data», passava por número).
  const number = /N[úu]mero do extrato\s*\n\s*#?([A-Z0-9]{4,})\s*\n/.exec(text)?.[1];
  const period = /\n\s*([A-Za-z]{3})\s+(\d{1,2})-(\d{1,2}),\s*(\d{4})\s*\n/.exec(text);
  if (!number) return { error: "sem número do extrato" };
  if (!period) return { error: "sem período do extrato" };
  const from = parseEnglishDate(`${period[1]} ${period[2]}, ${period[4]}`);
  const to = parseEnglishDate(`${period[1]} ${period[3]}, ${period[4]}`);
  if (!from || !to) return { error: "período ilegível" };

  // O resumo do mês vem antes das páginas de cada pagamento.
  const firstPayout = text.search(/Per[íi]odo de pagamento/i);
  const summary = blockLines(firstPayout > 0 ? text.slice(0, firstPayout) : text);
  if (!summary) return { error: "sem vendas no resumo do mês" };
  const total = amountAfterLabel(text.slice(0, firstPayout > 0 ? firstPayout : undefined), /Total l[íi]quido/);
  if (total === null) return { error: "sem total líquido" };

  const payouts: PlatformPayout[] = [];
  for (const page of text.split(/Per[íi]odo de pagamento:?/i).slice(1)) {
    const range = /([A-Za-z]{3}\s+\d{1,2},\s*\d{4})\s*-\s*([A-Za-z]{3}\s+\d{1,2},\s*\d{4})/.exec(page);
    const deposit = /Dep[óo]sito iniciado\s*:?\s*\n?\s*([A-Za-z]{3}\s+\d{1,2},\s*\d{4})/i.exec(page);
    const net = amountAfterLabel(page, /Pagamento l[íi]quido/);
    const periodFrom = range ? parseEnglishDate(range[1]!) : null;
    const periodTo = range ? parseEnglishDate(range[2]!) : null;
    if (periodFrom && periodTo && net !== null) {
      payouts.push({ periodFrom, periodTo, paidOn: deposit ? parseEnglishDate(deposit[1]!) : null, netCents: net });
    }
  }

  return {
    platform: "uber_eats",
    documentKind: "uber_monthly_statement",
    documentNumber: number,
    periodFrom: from,
    periodTo: to,
    issuedOn: null,
    ordersCount: summary.orders,
    lines: summary.lines,
    payouts,
    netPayoutCents: total,
  };
}
