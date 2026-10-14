import type { Invoice } from "../../domain/entities/invoice.js";
import type { InvoiceLine } from "../../domain/entities/invoice-line.js";
import { InvoiceAmountsNotReconciledError } from "../../domain/errors.js";
import type { CreateInvoiceLineCommand, DocumentAmountsCommand } from "../../domain/ports/in/invoice.ports.js";
import type { InvoiceAmountsRecord } from "../../domain/ports/out/invoice-amounts-write.port.js";
import { computeHeaderOnlyDifference, computeInvoiceAmounts, describeIssues } from "../../domain/services/invoice-amounts.service.js";

export interface ReconciledAmounts {
  invoice: Invoice;
  lines: InvoiceLine[];
  record: InvoiceAmountsRecord;
}

/**
 * Recalcula os valores no servidor com o motor único antes de finalizar (task
 * v1.2 §1.3). Nunca confia nos totais/IVA enviados: com linhas, base e IVA
 * passam a ser os do motor (IVA por taxa, repartido pelas linhas); sem linhas,
 * base + IVA + ajustes tem de dar o total. Não reconcilia ao cêntimo → erro
 * (a fatura não finaliza; o rascunho mantém-se).
 *
 * Notas de crédito guardam totais negativos: o cálculo é feito em valor
 * absoluto e o sinal é reposto.
 */
export function reconcileForFinalize(
  invoice: Invoice,
  lines: { line: InvoiceLine; cmd?: CreateInvoiceLineCommand | undefined }[],
  amounts: DocumentAmountsCommand | undefined,
  now: Date = new Date(),
): ReconciledAmounts {
  const abs = Math.abs;
  const adjustmentsCents = amounts?.adjustmentsCents ?? 0;
  const rounding = amounts?.roundingAdjustment ?? null;

  if (lines.length === 0) {
    const r = computeHeaderOnlyDifference({ subtotalWithoutVat: abs(invoice.subtotalWithoutVat), totalVat: abs(invoice.totalVat), totalWithVat: abs(invoice.totalWithVat), adjustmentsCents, roundingAdjustment: rounding });
    if (!r.canFinalize) {
      throw new InvoiceAmountsNotReconciledError(describeIssues([{ code: "difference", cents: r.finalDifferenceCents }]), {
        differenceCents: r.finalDifferenceCents,
        issues: [{ code: "difference" }],
        computed: { netCents: abs(invoice.subtotalWithoutVat), vatCents: abs(invoice.totalVat), totalCents: abs(invoice.subtotalWithoutVat) + abs(invoice.totalVat) + adjustmentsCents },
      });
    }
    return {
      invoice,
      lines: [],
      record: {
        grossCents: null, discountCents: null, globalDiscountKind: null, globalDiscountValue: null, footerDiscountCents: null,
        adjustmentsCents, roundingAdjustmentCents: r.roundingAdjustmentCents, roundingAdjustmentReason: r.roundingAdjustmentCents ? rounding!.reason.trim() : null,
        vatSummary: null, differenceCents: r.differenceCents, validatedAt: now, lines: [],
      },
    };
  }

  const r = computeInvoiceAmounts(
    {
      totalWithVat: abs(invoice.totalWithVat),
      globalDiscount: amounts?.globalDiscount ?? null,
      footerDiscountCents: amounts?.footerDiscountCents ?? null,
      adjustmentsCents,
      vatSummary: amounts?.vatSummary ?? null,
      roundingAdjustment: rounding,
    },
    lines.map(({ line, cmd }) => ({
      id: line.id,
      quantity: abs(line.quantity),
      quantityText: cmd?.quantityText ?? null,
      unitCostWithoutVat: abs(line.unitCostWithoutVat),
      unitPriceText: cmd?.unitPriceText ?? null,
      grossCentsPrinted: cmd?.grossCentsPrinted ?? null,
      discount: cmd?.discount ?? null,
      vatRate: line.vatRate,
    })),
  );
  if (!r.canFinalize) {
    throw new InvoiceAmountsNotReconciledError(describeIssues(r.blocking), {
      differenceCents: r.finalDifferenceCents,
      issues: r.blocking,
      computed: { netCents: r.netCents, vatCents: r.vatCents, totalCents: r.totalCents },
    });
  }

  const byId = new Map(r.lines.map((l) => [l.id, l]));
  const updatedLines = lines.map(({ line }) => {
    const sign = line.totalWithVat < 0 ? -1 : 1;
    const net = byId.get(line.id)!.netCents;
    const vat = r.lineVatCents.get(line.id) ?? 0;
    return line.updateValues({ vatAmount: sign * vat, totalWithVat: sign * (net + vat) });
  });
  const updatedInvoice = invoice.update({ subtotalWithoutVat: r.netCents, totalVat: r.vatCents });
  return {
    invoice: updatedInvoice,
    lines: updatedLines,
    record: {
      grossCents: r.grossCents,
      discountCents: r.discountCents,
      globalDiscountKind: amounts?.globalDiscount?.kind ?? null,
      globalDiscountValue: amounts?.globalDiscount?.value ?? null,
      footerDiscountCents: amounts?.footerDiscountCents ?? null,
      adjustmentsCents,
      roundingAdjustmentCents: r.roundingAdjustmentCents,
      roundingAdjustmentReason: r.roundingAdjustmentCents ? rounding!.reason.trim() : null,
      vatSummary: r.vatByRate,
      differenceCents: r.differenceCents,
      validatedAt: now,
      lines: lines.map(({ line, cmd }) => {
        const l = byId.get(line.id)!;
        return {
          lineId: line.id,
          quantityText: cmd?.quantityText ?? null,
          unitPriceText: cmd?.unitPriceText ?? null,
          grossCents: l.grossCents,
          discountKind: cmd?.discount?.kind ?? null,
          discountValue: cmd?.discount?.value ?? null,
          discountCents: l.lineDiscountCents,
          globalDiscountCents: l.globalDiscountCents,
          netCents: l.netCents,
        };
      }),
    },
  };
}
