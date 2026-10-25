import { createHash } from "crypto";
import type { StockPurchaseReview } from "../../domain/entities/stock-purchase-review.js";
import type { StockReviewLine } from "../../domain/entities/stock-review-line.js";
import { computeReviewConference, type ReviewConference } from "../../domain/services/review-conference.service.js";
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
    vatAmount: p.vatAmount,
    netAmount: line.netAmount,
    discountAmount: line.discountAmount,
    supplierItemCode: p.supplierItemCode,
    costCenterCategoryId: p.costCenterCategoryId,
    locationSplits: p.locationSplits,
    suggestion: p.suggestion
      ? {
          source: p.suggestion.source,
          resolution: p.suggestion.resolution,
          stockItemId: p.suggestion.stockItemId,
          conversionFactor: p.suggestion.conversionFactor,
          confidence: p.suggestion.confidence,
          packagingChanged: p.suggestion.packagingChanged,
        }
      : null,
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
    autoResolved: p.resolvedBy?.startsWith("sistema ·") ?? false,
  };
}

export function toStockPurchaseReviewDTO(review: StockPurchaseReview, lines: StockReviewLine[], conference?: ReviewConference): StockPurchaseReviewDTO {
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
    invoiceNetCents: p.invoiceNetCents,
    invoiceVatCents: p.invoiceVatCents,
    invoiceTotalCents: p.invoiceTotalCents,
    categoryDivergences: p.categoryDivergences,
    origin: p.origin,
    financePending: p.financePending,
    ...(conference && { conference }),
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
export function computeInvoiceSourceHash(
  invoiceNumber: string,
  invoiceDate: string,
  lines: Pick<InvoiceLineSnapshot, "id" | "quantity" | "unitCostWithoutVat" | "totalWithVat">[],
): string {
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

/** Conferências da F3a para uma revisão (uma leitura do catálogo de categorias). */
export async function conferenceFor(
  organizationId: import("../../../../kernel/organization-id.js").OrganizationId,
  review: StockPurchaseReview,
  lines: StockReviewLine[],
  categoryRead: import("../../domain/ports/out/cost-center-category-read.port.js").CostCenterCategoryReadPort,
): Promise<ReviewConference> {
  const p = review.toProps();
  const props = lines.map((l) => l.toProps());
  const categoryIds = [...new Set(props.map((l) => l.costCenterCategoryId).filter((id): id is string => id !== null))];
  const categoryPolicies = await categoryRead.getStockReviewPolicies(organizationId, categoryIds);
  return computeReviewConference({
    invoiceNetCents: p.invoiceNetCents,
    invoiceVatCents: p.invoiceVatCents,
    invoiceTotalCents: p.invoiceTotalCents,
    lines: props.map((l) => ({ id: l.id, description: l.description, totalWithVat: l.totalWithVat, vatAmount: l.vatAmount, resolutionType: l.resolutionType, costCenterCategoryId: l.costCenterCategoryId })),
    categoryPolicies,
  });
}

/** Nome da categoria financeira em cada linha (uma leitura do catálogo). */
export async function withCategoryLabels(
  organizationId: import("../../../../kernel/organization-id.js").OrganizationId,
  dto: StockPurchaseReviewDTO,
  categoryRead: import("../../domain/ports/out/cost-center-category-read.port.js").CostCenterCategoryReadPort | undefined,
): Promise<StockPurchaseReviewDTO> {
  if (!categoryRead?.getLabels) return dto;
  const ids = [...new Set(dto.lines.map((l) => l.costCenterCategoryId).filter((id): id is string => !!id))];
  const labels = await categoryRead.getLabels(organizationId, ids);
  return { ...dto, lines: dto.lines.map((l) => ({ ...l, costCenterCategoryLabel: l.costCenterCategoryId ? labels.get(l.costCenterCategoryId) ?? null : null })) };
}
