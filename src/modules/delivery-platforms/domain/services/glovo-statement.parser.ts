import type { PlatformStatement, StatementLine } from "../entities/platform-statement.js";
import { amountAfterLabel, parseAmountCents } from "./text-amounts.js";

/** Extrato quinzenal da Glovo (PDF «Extrato n.º I…»: fatura das taxas + valor a transferir). */
export function isGlovoStatement(text: string): boolean {
  return /Glovoapp/i.test(text) && /Valor a transferir/i.test(text) && /Servi[çc]o prestado entre/i.test(text);
}

/**
 * Taxas da fatura (sem IVA), pela ordem do documento. «Taxa de serviço da plataforma» e «… de estafetas»
 * são o detalhe da taxa de acesso e não se somam. Uma taxa nova que apareça entre a primeira linha e o
 * «Subtotal» entra como `other_fee`, para o total continuar a bater.
 */
const FEE_KINDS: [RegExp, StatementLine["kind"]][] = [
  [/^Taxa de acesso/i, "commission"],
  [/Glovo Prime/i, "commission"],
  [/^Marketing/i, "marketing"],
  [/Ofertas Flash/i, "marketing"],
];
const FEE_DETAIL = /^Taxa de servi[çc]o d(a plataforma|e estafetas)/i;

/** Liquidação (depois da fatura): rótulo → natureza; o sinal vem do documento. */
const SETTLEMENT: [RegExp, StatementLine["kind"], string][] = [
  [/^\+\s*Produtos/i, "sales", "Produtos"],
  [/^\+\s*Servi[çc]o de entrega/i, "sales", "Serviço de entrega"],
  [/^-\s*Promo[çc][ãa]o de produtos/i, "promotion", "Promoção de produtos paga pelo parceiro"],
  [/^-\s*Promo[çc][ãa]o Flash/i, "promotion", "Promoção Flash paga pelo parceiro"],
  [/^-\s*Custo dos incidentes/i, "refund", "Custo dos incidentes sobre os produtos"],
  [/^\+\s*Reembolso de incidentes/i, "refund", "Reembolso de incidentes"],
  [/^-\s*Custo de cancelamentos/i, "refund", "Cancelamentos e incidentes do serviço"],
  [/^-\s*Entrega gr[áa]tis/i, "refund", "Entrega grátis devido a incidente"],
  [/^-\s*Pagamentos j[áa] efetuados em dinheiro/i, "cash", "Pagamentos em dinheiro"],
  [/^-\s*D[íi]vida acumulada/i, "adjustment", "Dívida acumulada"],
];

const lineAmount = (line: string) => {
  const m = /(-?[\d.]+,\d{2})\s*€\s*$/.exec(line.trim());
  return m ? parseAmountCents(m[1]!) : null;
};

export function parseGlovoStatement(text: string): PlatformStatement | { error: string } {
  // O número vem logo a seguir ao rótulo ou (no texto extraído do PDF) antes dele; só maiúsculas e algarismos.
  const number = /Extrato n\.?\s*º?:?[ \t]*([A-Z0-9]{8,})/.exec(text)?.[1] ?? /([A-Z0-9]{8,})\s+Extrato n\.?\s*º/.exec(text)?.[1];
  const period = /Servi[çc]o prestado entre\s+(\d{4}-\d{2}-\d{2})\s+e\s+(\d{4}-\d{2}-\d{2})/i.exec(text);
  const issued = /\bData:\s*(\d{4}-\d{2}-\d{2})/.exec(text)?.[1] ?? null;
  if (!number) return { error: "sem número do extrato" };
  if (!period) return { error: "sem período do serviço" };

  const rows = text.split(/\r?\n/).map((l) => l.trim());
  const start = rows.findIndex((l) => /^Taxa de acesso/i.test(l));
  const subtotalAt = rows.findIndex((l) => /^Subtotal\b/i.test(l));
  if (start < 0 || subtotalAt < start) return { error: "sem quadro das taxas" };

  // Taxas sem IVA; o IVA da fatura reparte-se pelas taxas na proporção (o arredondamento fica na última).
  const fees: StatementLine[] = [];
  for (const row of rows.slice(start, subtotalAt)) {
    if (FEE_DETAIL.test(row)) continue;
    const cents = lineAmount(row);
    if (cents === null) continue;
    const label = row.replace(/\s*-?[\d.]+,\d{2}\s*€\s*$/, "");
    const kind = FEE_KINDS.find(([re]) => re.test(label))?.[1] ?? "other_fee";
    fees.push({ kind, label, grossCents: cents, vatCents: 0 });
  }
  const subtotal = lineAmount(rows[subtotalAt]!) ?? 0;
  const vat = amountAfterLabel(text, /IVA \(\d+\s*%\)/) ?? 0;
  if (fees.reduce((a, f) => a + f.grossCents, 0) !== subtotal) return { error: "as taxas não somam o subtotal da fatura" };
  let vatLeft = vat;
  fees.forEach((f, i) => {
    const share = i === fees.length - 1 ? vatLeft : Math.round((vat * f.grossCents) / (subtotal || 1));
    vatLeft -= share;
    f.vatCents = share;
    f.grossCents += share;
  });

  const settlement: StatementLine[] = [];
  for (const row of rows) {
    const hit = SETTLEMENT.find(([re]) => re.test(row));
    const cents = hit ? lineAmount(row) : null;
    if (!hit || cents === null || cents === 0) continue;
    // O documento dá as deduções a negativo e os acréscimos a positivo; aqui as reduções ficam positivas.
    settlement.push({ kind: hit[1], label: hit[2], grossCents: hit[1] === "sales" ? cents : -cents, vatCents: 0 });
  }
  const transfer = amountAfterLabel(text, /Valor a transferir/);
  if (transfer === null) return { error: "sem valor a transferir" };
  const orders = rows.filter((l) => /^\d{9,}\s+\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}/.test(l)).length;

  return {
    platform: "glovo",
    documentKind: "glovo_statement",
    documentNumber: number,
    periodFrom: period[1]!,
    periodTo: period[2]!,
    issuedOn: issued,
    ordersCount: orders > 0 ? orders : null,
    lines: [...settlement, ...fees].filter((l) => l.grossCents !== 0),
    payouts: [{ periodFrom: period[1]!, periodTo: period[2]!, paidOn: null, netCents: transfer }],
    netPayoutCents: transfer,
  };
}
