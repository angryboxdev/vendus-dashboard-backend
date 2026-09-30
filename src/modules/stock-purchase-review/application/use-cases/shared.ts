import { createHash } from "crypto";
import type { StockPurchaseReview } from "../../domain/entities/stock-purchase-review.js";
import type { StockReviewLine } from "../../domain/entities/stock-review-line.js";
import type { StockPurchaseReviewDTO, StockReviewLineDTO } from "../../domain/ports/in/stock-purchase-review.ports.js";
import type { InvoiceLineSnapshot } from "../../domain/ports/out/invoice-read.port.js";

export function toStockReviewLineDTO(line: StockReviewLine): StockReviewLineDTO {
  const p = line.toProps();
  return {
    id: p.id,
    invoiceLineId: p.invoiceLineId,
    description: p.description,
    purchaseQuantity: p.purchaseQuantity,
    purchaseUnit: p.purchaseUnit,
    unitCostWithoutVat: p.unitCostWithoutVat,
    totalWithVat: p.totalWithVat,
    resolutionType: p.resolutionType,
    stockItemId: p.stockItemId,
    conversionFactor: p.conversionFactor,
    stockQuantity: p.stockQuantity,
    locationId: p.locationId,
    unitCostPerBaseUnitWithVat: p.unitCostPerBaseUnitWithVat,
    unitCostPerBaseUnitWithoutVat: p.unitCostPerBaseUnitWithoutVat,
    flaggedSuspiciousConversion: p.flaggedSuspiciousConversion,
    flagReason: p.flagReason,
    resolvedBy: p.resolvedBy,
    resolvedAt: p.resolvedAt ? p.resolvedAt.toISOString() : null,
  };
}

export function toStockPurchaseReviewDTO(review: StockPurchaseReview, lines: StockReviewLine[]): StockPurchaseReviewDTO {
  const p = review.toProps();
  return {
    id: p.id,
    invoiceId: p.invoiceId,
    status: p.status,
    version: p.version,
    decisionSource: p.decisionSource,
    decisionCategoryId: p.decisionCategoryId,
    decisionSupplierId: p.decisionSupplierId,
    decisionPolicyUsed: p.decisionPolicyUsed,
    decisionActor: p.decisionActor,
    decisionOverrideReason: p.decisionOverrideReason,
    decisionAt: p.decisionAt.toISOString(),
    supplierName: p.supplierName,
    invoiceNumber: p.invoiceNumber,
    invoiceDate: p.invoiceDate,
    locationId: p.locationId,
    appliedAt: p.appliedAt ? p.appliedAt.toISOString() : null,
    cancelledAt: p.cancelledAt ? p.cancelledAt.toISOString() : null,
    cancellationReason: p.cancellationReason,
    lines: lines.map(toStockReviewLineDTO),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

/**
 * Hash estável sobre os campos que, se mudarem, invalidam uma revisão já
 * criada (secção 14 da task) — cabeçalho + quantidade/custo/total por
 * linha. Nunca inclui campos que mudam por razões alheias à fatura em si
 * (ex: `updatedAt` de outra escrita não relacionada).
 */
export function computeInvoiceSourceHash(invoiceNumber: string, invoiceDate: string, lines: InvoiceLineSnapshot[]): string {
  const payload = JSON.stringify({
    invoiceNumber,
    invoiceDate,
    lines: lines
      .map((l) => ({ id: l.id, quantity: l.quantity, unitCostWithoutVat: l.unitCostWithoutVat, totalWithVat: l.totalWithVat }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  });
  return createHash("sha256").update(payload).digest("hex");
}

/** Normaliza para chave de mapeamento aprendido (secção 27) — minúsculas, espaços colapsados. */
export function normalizeDescription(description: string): string {
  return description.trim().toLowerCase().replace(/\s+/g, " ");
}
