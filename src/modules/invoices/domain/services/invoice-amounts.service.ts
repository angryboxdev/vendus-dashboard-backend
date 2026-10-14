import { dec, parseDecimal, resolveQuantity, type Dec } from "../../../../kernel/money/decimal.js";
import { computeDocumentAmounts, distribute, type AmountIssue, type Discount, type DocumentAmounts } from "../../../../kernel/money/document-amounts.js";

/**
 * Valores de uma fatura de fornecedor com o motor único (kernel/money) — task
 * v1.2 §1.3. Recalculado no servidor ao finalizar; os valores enviados pelo
 * cliente nunca são confiados.
 */

export interface AmountLineInput {
  id: string;
  /** Quantidade (número) e, se houver, o texto original do documento ("20.000"). */
  quantity: number;
  quantityText?: string | null;
  /** Preço unitário sem IVA em cêntimos e, se houver, o texto original (pode ter mais casas). */
  unitCostWithoutVat: number;
  unitPriceText?: string | null;
  /** Bruto impresso na linha (cêntimos), para resolver quantidades ambíguas. */
  grossCentsPrinted?: number | null;
  discount?: { kind: "pct" | "amount"; value: number } | null;
  /** Taxa de IVA (%); null = por validar. */
  vatRate: number | null;
}

export interface AmountHeaderInput {
  totalWithVat: number;
  globalDiscount?: { kind: "pct" | "amount"; value: number } | null;
  footerDiscountCents?: number | null;
  adjustmentsCents?: number;
  /** Quadro de IVA por taxa tal como no documento (opcional). */
  vatSummary?: { rate: number; baseCents: number; vatCents: number }[] | null;
  roundingAdjustment?: { cents: number; reason: string } | null;
}

export interface InvoiceAmounts extends DocumentAmounts {
  /** IVA por linha (repartição exata do IVA de cada taxa). */
  lineVatCents: Map<string, number>;
  roundingAdjustmentCents: number;
  /** Diferença depois do ajuste de arredondamento autorizado. */
  finalDifferenceCents: number | null;
  /** Pode finalizar: tudo validado e diferença final 0. */
  canFinalize: boolean;
  blocking: AmountIssue[];
}

/** Política explícita de arredondamento: no máximo 1 cêntimo por taxa de IVA, com motivo (≥ 5 caracteres). */
export const ROUNDING_CENTS_PER_RATE = 1;

const numDec = (n: number): Dec => dec(String(n));

function toDiscount(d: { kind: "pct" | "amount"; value: number } | null | undefined): Discount | null {
  if (!d || !(d.value > 0)) return null;
  return d.kind === "pct" ? { kind: "pct", value: numDec(d.value) } : { kind: "amount", cents: Math.round(d.value) };
}

function unitPriceOf(l: AmountLineInput): Dec {
  const text = l.unitPriceText?.trim();
  if (text) {
    const parsed = parseDecimal(text, ",") ?? parseDecimal(text, ".");
    if (parsed) return parsed;
  }
  return { units: BigInt(Math.round(l.unitCostWithoutVat)), scale: 2 };
}

function quantityOf(l: AmountLineInput, price: Dec): Dec {
  const text = l.quantityText?.trim();
  if (text && l.grossCentsPrinted != null) {
    const q = resolveQuantity(text, price, l.grossCentsPrinted);
    if (q) return q;
  }
  return numDec(l.quantity);
}

export function computeInvoiceAmounts(header: AmountHeaderInput, lines: AmountLineInput[]): InvoiceAmounts {
  const r = computeDocumentAmounts({
    lines: lines.map((l) => {
      const price = unitPriceOf(l);
      return { id: l.id, quantity: quantityOf(l, price), unitPrice: price, discount: toDiscount(l.discount), vatRate: l.vatRate === null ? null : numDec(l.vatRate) };
    }),
    globalDiscount: toDiscount(header.globalDiscount),
    footerDiscountCents: header.footerDiscountCents ?? null,
    adjustments: header.adjustmentsCents ? [{ label: "Ajustes documentados", cents: header.adjustmentsCents }] : [],
    declared: { totalCents: header.totalWithVat, vatByRate: header.vatSummary?.map((v) => ({ rate: numDec(v.rate), baseCents: v.baseCents, vatCents: v.vatCents })) ?? null },
  });

  // IVA por linha: cada taxa reparte o seu IVA pelas linhas dessa taxa (soma exata).
  const lineVatCents = new Map<string, number>();
  for (const g of r.vatByRate) {
    const ofRate = r.lines.filter((l) => l.vatRate === g.rate);
    distribute(g.vatCents, ofRate.map((l) => l.netCents)).forEach((c, i) => lineVatCents.set(ofRate[i]!.id, c));
  }

  const adj = header.roundingAdjustment;
  const maxAdj = Math.max(1, r.vatByRate.length) * ROUNDING_CENTS_PER_RATE;
  const adjAllowed = !!adj && Math.abs(adj.cents) <= maxAdj && adj.reason.trim().length >= 5;
  const roundingAdjustmentCents = adjAllowed ? adj!.cents : 0;
  const finalDifferenceCents = r.differenceCents === null ? null : r.differenceCents - roundingAdjustmentCents;
  // A diferença coberta pelo ajuste autorizado deixa de bloquear; o resto dos problemas bloqueia sempre.
  const blocking = r.issues.filter((i) => i.code !== "difference" && !(i.code === "vat_mismatch" && adjAllowed && Math.abs(i.declaredCents - i.computedCents) <= ROUNDING_CENTS_PER_RATE));
  if (finalDifferenceCents !== null && finalDifferenceCents !== 0) blocking.push({ code: "difference", cents: finalDifferenceCents });
  return { ...r, lineVatCents, roundingAdjustmentCents, finalDifferenceCents, canFinalize: blocking.length === 0, blocking };
}

/** Faturas sem linhas (classificação única): base + IVA + ajustes = total, ao cêntimo. */
export function computeHeaderOnlyDifference(h: { subtotalWithoutVat: number; totalVat: number; totalWithVat: number; adjustmentsCents?: number; roundingAdjustment?: { cents: number; reason: string } | null }) {
  const adj = h.roundingAdjustment && Math.abs(h.roundingAdjustment.cents) <= ROUNDING_CENTS_PER_RATE && h.roundingAdjustment.reason.trim().length >= 5 ? h.roundingAdjustment.cents : 0;
  const differenceCents = h.totalWithVat - (h.subtotalWithoutVat + h.totalVat + (h.adjustmentsCents ?? 0));
  return { differenceCents, roundingAdjustmentCents: adj, finalDifferenceCents: differenceCents - adj, canFinalize: differenceCents - adj === 0 };
}

const ISSUE_TEXT: Record<AmountIssue["code"], string> = {
  vat_rate_missing: "linha sem taxa de IVA",
  line_without_price: "linha sem preço",
  negative_value: "valor negativo numa linha",
  discount_exceeds_base: "desconto maior do que a base",
  footer_discount_ambiguous: "desconto do rodapé ambíguo (resumo ou adicional?)",
  vat_mismatch: "IVA por taxa diferente do documento",
  total_missing: "total da fatura em falta",
  difference: "diferença para a fatura",
};

export function describeIssues(issues: AmountIssue[]): string {
  return [...new Set(issues.map((i) => (i.code === "difference" ? `${ISSUE_TEXT.difference} de ${(i.cents / 100).toFixed(2).replace(".", ",")} €` : ISSUE_TEXT[i.code])))].join("; ");
}
