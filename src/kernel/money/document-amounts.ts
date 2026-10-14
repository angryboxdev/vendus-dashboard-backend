import { decToString, mulToCents, pctOfCents, type Dec } from "./decimal.js";

/**
 * Motor único de valores de um documento de compra (Financeiro e Stock usam
 * este mesmo cálculo — task v1.2 §1.3):
 *
 *   bruto − descontos comerciais efetivos = base líquida
 *   base + IVA (por taxa) + ajustes documentados = total
 *
 * Tudo em cêntimos inteiros; quantidades e preços em decimal exato. Não
 * inventa: taxa de IVA em falta é um problema por validar (não 0%), desconto
 * de rodapé ambíguo não é aplicado, diferença para a fatura só é zero quando
 * reconcilia ao cêntimo.
 */

export type Discount = { kind: "pct"; value: Dec } | { kind: "amount"; cents: number };

export interface AmountLine {
  id: string;
  quantity: Dec;
  /** Preço unitário sem IVA, antes de descontos (em euros). */
  unitPrice: Dec | null;
  /** Valor bruto da linha quando não há preço unitário fiável (cêntimos). */
  grossCents?: number | null;
  /** Desconto comercial da linha (% ou €: a mesma operação). */
  discount: Discount | null;
  /** Taxa de IVA em % tal como no documento; null = por validar. */
  vatRate: Dec | null;
  /** A linha está abrangida pelo desconto global (por omissão sim). */
  inGlobalDiscount?: boolean;
}

export interface DeclaredTotals {
  totalCents: number | null;
  vatByRate?: { rate: Dec; baseCents: number; vatCents: number }[] | null;
}

export interface DocumentInput {
  lines: AmountLine[];
  /** Desconto global adicional, efetivamente presente no documento. */
  globalDiscount?: Discount | null;
  /** Desconto impresso no rodapé (pode só resumir os das linhas). */
  footerDiscountCents?: number | null;
  /** Ajustes documentados (ex.: portes, ecovalor) — somam ao total. */
  adjustments?: { label: string; cents: number }[];
  declared: DeclaredTotals;
}

export type AmountIssue =
  | { code: "vat_rate_missing"; lineId: string }
  | { code: "line_without_price"; lineId: string }
  | { code: "negative_value"; lineId: string }
  | { code: "discount_exceeds_base"; lineId: string | null }
  | { code: "footer_discount_ambiguous"; footerCents: number; linesCents: number }
  | { code: "vat_mismatch"; rate: string; computedCents: number; declaredCents: number }
  | { code: "total_missing" }
  | { code: "difference"; cents: number };

export interface LineAmounts {
  id: string;
  grossCents: number;
  lineDiscountCents: number;
  globalDiscountCents: number;
  netCents: number;
  vatRate: string | null;
}

export interface DocumentAmounts {
  lines: LineAmounts[];
  vatByRate: { rate: string; baseCents: number; vatCents: number }[];
  grossCents: number;
  discountCents: number;
  netCents: number;
  vatCents: number;
  adjustmentsCents: number;
  totalCents: number;
  /** Total declarado − total calculado ("Diferença para a fatura"); null sem total declarado. */
  differenceCents: number | null;
  /** O que se fez com o desconto do rodapé. */
  footer: "none" | "summary_of_lines" | "global" | "ambiguous";
  issues: AmountIssue[];
  /** Pode finalizar: diferença 0 e nenhum problema por validar. */
  reconciled: boolean;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

function discountCents(baseCents: number, d: Discount): number {
  return d.kind === "pct" ? pctOfCents(baseCents, d.value) : d.cents;
}

/**
 * Reparte `total` cêntimos proporcionalmente a `weights`, com soma exata
 * (maior resto; empates pela ordem das linhas) — determinístico.
 */
export function distribute(total: number, weights: number[]): number[] {
  const W = BigInt(sum(weights));
  if (!W || !total) return weights.map(() => 0);
  const T = BigInt(total);
  // Inteiros exatos (BigInt): sem perda de precisão em valores grandes.
  const parts = weights.map((w, i) => ({ i, q: (T * BigInt(w)) / W, r: (T * BigInt(w)) % W }));
  let left = T - parts.reduce((a, p) => a + p.q, 0n);
  for (const p of [...parts].sort((a, b) => (b.r > a.r ? 1 : b.r < a.r ? -1 : a.i - b.i))) {
    if (left <= 0n) break;
    p.q += 1n;
    left -= 1n;
  }
  return parts.map((p) => Number(p.q));
}

export function computeDocumentAmounts(input: DocumentInput): DocumentAmounts {
  const issues: AmountIssue[] = [];
  // 1. Bruto e desconto de cada linha.
  const lines = input.lines.map((l) => {
    let gross: number;
    if (l.unitPrice) gross = mulToCents(l.quantity, l.unitPrice);
    else if (l.grossCents != null) gross = l.grossCents;
    else {
      issues.push({ code: "line_without_price", lineId: l.id });
      gross = 0;
    }
    if (gross < 0 || l.quantity.units < 0n) issues.push({ code: "negative_value", lineId: l.id });
    const lineDiscount = l.discount ? discountCents(gross, l.discount) : 0;
    if (lineDiscount > gross || lineDiscount < 0) issues.push({ code: "discount_exceeds_base", lineId: l.id });
    return { src: l, gross, lineDiscount, global: 0 };
  });
  const linesDiscount = sum(lines.map((l) => l.lineDiscount));

  // 2. Desconto global: explícito, ou o do rodapé quando não é só o resumo das linhas.
  let footer: DocumentAmounts["footer"] = "none";
  let global: Discount | null = input.globalDiscount ?? null;
  const printed = input.footerDiscountCents ?? null;
  if (!global && printed) {
    if (printed === linesDiscount) footer = "summary_of_lines";
    else if (linesDiscount === 0) {
      footer = "global";
      global = { kind: "amount", cents: printed };
    } else {
      footer = "ambiguous";
      issues.push({ code: "footer_discount_ambiguous", footerCents: printed, linesCents: linesDiscount });
    }
  } else if (global) footer = "global";

  if (global) {
    const eligible = lines.filter((l) => l.src.inGlobalDiscount !== false);
    const bases = eligible.map((l) => l.gross - l.lineDiscount);
    const globalCents = discountCents(sum(bases), global);
    if (globalCents > sum(bases) || globalCents < 0) issues.push({ code: "discount_exceeds_base", lineId: null });
    distribute(globalCents, bases).forEach((c, i) => (eligible[i]!.global = c));
  }

  // 3. Base por linha e IVA por taxa (quadro-resumo do documento).
  const out: LineAmounts[] = lines.map((l) => ({
    id: l.src.id,
    grossCents: l.gross,
    lineDiscountCents: l.lineDiscount,
    globalDiscountCents: l.global,
    netCents: l.gross - l.lineDiscount - l.global,
    vatRate: l.src.vatRate ? decToString(l.src.vatRate) : null,
  }));
  for (const l of out) if (l.vatRate === null) issues.push({ code: "vat_rate_missing", lineId: l.id });
  const groups = new Map<string, { rate: Dec; base: number }>();
  for (const [i, l] of out.entries()) {
    const rate = input.lines[i]!.vatRate;
    if (!rate || l.vatRate === null) continue;
    const g = groups.get(l.vatRate) ?? { rate, base: 0 };
    g.base += l.netCents;
    groups.set(l.vatRate, g);
  }
  const vatByRate = [...groups.entries()]
    .map(([rate, g]) => ({ rate, baseCents: g.base, vatCents: pctOfCents(g.base, g.rate) }))
    .sort((a, b) => Number(a.rate) - Number(b.rate));
  for (const d of input.declared.vatByRate ?? []) {
    const key = decToString(d.rate);
    const mine = vatByRate.find((v) => v.rate === key);
    if (!mine || mine.vatCents !== d.vatCents) issues.push({ code: "vat_mismatch", rate: key, computedCents: mine?.vatCents ?? 0, declaredCents: d.vatCents });
  }

  // 4. Totais e diferença para a fatura.
  const grossCents = sum(out.map((l) => l.grossCents));
  const discount = sum(out.map((l) => l.lineDiscountCents + l.globalDiscountCents));
  const netCents = sum(out.map((l) => l.netCents));
  const vatCents = sum(vatByRate.map((v) => v.vatCents));
  const adjustmentsCents = sum((input.adjustments ?? []).map((a) => a.cents));
  const totalCents = netCents + vatCents + adjustmentsCents;
  const declared = input.declared.totalCents;
  const differenceCents = declared === null ? null : declared - totalCents;
  if (declared === null) issues.push({ code: "total_missing" });
  else if (differenceCents !== 0) issues.push({ code: "difference", cents: differenceCents! });

  return { lines: out, vatByRate, grossCents, discountCents: discount, netCents, vatCents, adjustmentsCents, totalCents, differenceCents, footer, issues, reconciled: issues.length === 0 };
}
