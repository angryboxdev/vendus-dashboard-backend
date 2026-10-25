import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { AiExtractedLineDTO, CreateInvoiceLineCommand, InvoiceImportResultDTO } from "../../domain/ports/in/invoice.ports.js";
import type { SaveInvoiceDraftUseCase } from "./save-invoice-draft.use-case.js";

const STD_VAT = [0, 6, 13, 23];
const nearestVat = (rate: number | null) => (rate == null ? 0 : STD_VAT.reduce((a, b) => (Math.abs(b - rate) < Math.abs(a - rate) ? b : a)));

/** Linha extraída (leitor/IA) → linha do rascunho; o motor de valores recalcula ao guardar. */
export function extractedToLineCommand(l: AiExtractedLineDTO): CreateInvoiceLineCommand {
  const quantity = l.quantity && l.quantity > 0 ? l.quantity : 1;
  const hasDiscount = (l.discountPct ?? 0) > 0 || (l.discountAmount ?? 0) > 0;
  const unit = l.unitPriceWithoutVat ?? (!hasDiscount && l.totalWithoutVat != null ? Math.round(l.totalWithoutVat / quantity) : 0);
  const vatAmount = l.vatAmount ?? 0;
  return {
    description: l.description,
    quantity,
    unitCostWithoutVat: unit,
    vatRate: nearestVat(l.vatRate),
    vatAmount,
    totalWithVat: l.totalWithVat ?? (l.totalWithoutVat ?? Math.round(unit * quantity)) + vatAmount,
    quantityText: l.quantityText ?? null,
    unitPriceText: l.unitPriceText ?? null,
    grossCentsPrinted: l.grossWithoutDiscount ?? null,
    discount: (l.discountPct ?? 0) > 0 ? { kind: "pct", value: l.discountPct! } : (l.discountAmount ?? 0) > 0 ? { kind: "amount", value: l.discountAmount! } : null,
    reading: l.meta ? { ...l.meta, classificationSource: l.classificationSource ?? null, classificationEvidence: l.classificationEvidence ?? null } : null,
    costCenterCategoryId: l.suggestedCostCenterCategoryId ?? null,
  };
}

/**
 * Grava no rascunho as linhas lidas e os valores do documento (descontos globais/rodapé, quadro de
 * IVA), em «Por artigo» — para o rascunho poder ser reaberto mais tarde sem perder o que foi lido
 * (importação no Stock, F3c; importação em lote, E4). Não finaliza nada.
 */
export async function persistExtractedDraft(
  saveDraft: Pick<SaveInvoiceDraftUseCase, "execute">,
  organizationId: OrganizationId,
  result: InvoiceImportResultDTO,
  actor: string,
): Promise<void> {
  const a = result.extractedAmounts;
  await saveDraft.execute({
    organizationId,
    id: result.invoice.id,
    lines: result.extractedLines.map(extractedToLineCommand),
    financialMode: "by_item",
    ...(a && {
      amounts: {
        globalDiscount:
          (a.globalDiscountPct ?? 0) > 0 ? { kind: "pct", value: a.globalDiscountPct! } : (a.globalDiscountAmount ?? 0) > 0 ? { kind: "amount", value: a.globalDiscountAmount! } : null,
        footerDiscountCents: a.footerDiscountAmount,
        vatSummary: a.vatSummary,
      },
    }),
    actor,
  });
}
