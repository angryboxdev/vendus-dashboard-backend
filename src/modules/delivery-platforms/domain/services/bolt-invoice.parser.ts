import type { PlatformStatement, StatementLine } from "../entities/platform-statement.js";
import { parseAmountCents } from "./text-amounts.js";

/** Fatura semanal da Bolt Food (PDF `PT1426-…`, segunda a domingo, IVA em autoliquidação). */
export function isBoltWeeklyInvoice(text: string): boolean {
  return /Bolt Operations/i.test(text) && /Fatura n[ºo°]?\s*:/i.test(text) && /Per[íi]odo da fatura/i.test(text);
}

/** Natureza de cada linha, pelo título. «Investimento na campanha» (negativo) é a parte da campanha que a Bolt paga. */
const LINE_KINDS: [RegExp, StatementLine["kind"]][] = [
  [/comiss/i, "commission"],
  [/campanha|cofinanciad/i, "marketing"],
  [/reembolso/i, "refund"],
];

const NUMBER = /-?\d+(?:[.,]\d+)?/g;
const dmy = (raw: string) => {
  const m = /(\d{2})-(\d{2})-(\d{4})/.exec(raw);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};

/**
 * Linhas da tabela «Título · Total · IVA (%) · IVA · Total»: um título pode ocupar duas linhas no texto
 * («Custos com campanhas» / «cofinanciadas 0.24 …»), por isso junta-se ao seguinte até aparecerem os valores.
 */
function tableRows(text: string): { title: string; values: number[] }[] {
  const start = text.search(/^T[íi]tulo\b/m);
  if (start < 0) return [];
  const rows: { title: string; values: number[] }[] = [];
  let pending = "";
  for (const raw of text.slice(start).split(/\r?\n/).slice(1)) {
    const line = raw.trim();
    if (!line || /^--\s*\d+\s+of\s+\d+/.test(line)) continue;
    if (/^Total\b/i.test(line)) break;
    const firstNumber = line.search(/\s-?\d+(?:[.,]\d+)?(\s|$)/);
    if (firstNumber < 0) {
      pending = `${pending} ${line}`.trim();
      continue;
    }
    const title = `${pending} ${line.slice(0, firstNumber)}`.replace(/\s+/g, " ").trim();
    const values = (line.slice(firstNumber).match(NUMBER) ?? []).map((v) => parseAmountCents(v) ?? 0);
    rows.push({ title, values });
    pending = "";
  }
  return rows;
}

/**
 * Taxas da semana: comissão, campanha (taxa, cofinanciados, investimento da Bolt) e reembolsos. Não traz as
 * vendas (vêm do relatório de pedidos): \`netPayoutCents\` é − o total da fatura, o que abate à transferência.
 */
export function parseBoltWeeklyInvoice(text: string): PlatformStatement | { error: string } {
  const number = /Fatura n[ºo°]?\s*:\s*([A-Z]{2}\d+-\d+)/.exec(text)?.[1];
  const period = /Per[íi]odo da fatura:\s*(\d{2}-\d{2}-\d{4})\s*-\s*(\d{2}-\d{2}-\d{4})/.exec(text);
  const total = /Total inclu[íi]ndo IVA \(EUR\):?\s*(-?[\d.,]+)/.exec(text)?.[1];
  if (!number) return { error: "sem número da fatura" };
  if (!period) return { error: "sem período da fatura" };
  const totalCents = total ? parseAmountCents(total) : null;
  if (totalCents === null) return { error: "sem total da fatura" };

  const rows = tableRows(text);
  if (rows.length === 0) return { error: "sem linhas na fatura" };
  const lines: StatementLine[] = rows.map(({ title, values }) => {
    // [total sem IVA, IVA %, IVA €, total]; com uma só coluna, é o total.
    const gross = values[values.length - 1] ?? 0;
    const vat = values.length >= 4 ? values[2]! : 0;
    return { kind: LINE_KINDS.find(([re]) => re.test(title))?.[1] ?? "other_fee", label: title, grossCents: gross, vatCents: vat };
  });
  const sum = lines.reduce((a, l) => a + l.grossCents, 0);
  if (Math.abs(sum - totalCents) > 2) return { error: `as linhas não somam o total da fatura (${sum} × ${totalCents} cêntimos)` };

  return {
    platform: "bolt_food",
    documentKind: "bolt_weekly_invoice",
    documentNumber: number,
    periodFrom: dmy(period[1]!)!,
    periodTo: dmy(period[2]!)!,
    issuedOn: dmy(/\bData:\s*(\d{2}-\d{2}-\d{4})/.exec(text)?.[1] ?? ""),
    ordersCount: null,
    lines,
    payouts: [],
    netPayoutCents: -totalCents,
  };
}
