import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { PurchasePresentation } from "../../domain/entities/purchase-presentation.js";
import type { StockPurchaseReviewDTO } from "../../domain/ports/in/stock-purchase-review.ports.js";
import type { PurchasePresentationRepositoryPort } from "../../domain/ports/out/purchase-presentation-repository.port.js";
import type { StockCatalogWritePort } from "../../domain/ports/out/stock-catalog-write.port.js";
import { invoiceLineToStock, invoiceQuantityUnit } from "../../domain/services/presentation-conversion.service.js";
import { toPurchasePresentationDTO } from "./purchase-presentations.use-case.js";
import { normalizeDescription } from "./shared.js";

export interface PackagingDeps {
  presentations: PurchasePresentationRepositoryPort;
  catalog: StockCatalogWritePort;
}

/**
 * Junta a cada linha da revisão a apresentação de compra ativa (fornecedor + referência, ou
 * descrição) e a pré-visualização legível: embalagens equivalentes, quantidade que entra no Stock
 * na unidade base do artigo, fator e custos líquidos (por unidade base, por unidade do conteúdo e
 * por embalagem). Sem apresentação → `presentation: null` («Embalagem por configurar» na UI).
 */
export async function withPackaging(organizationId: OrganizationId, dto: StockPurchaseReviewDTO, deps: PackagingDeps | undefined): Promise<StockPurchaseReviewDTO> {
  const supplierId = dto.decisionSupplierId;
  if (!deps || !supplierId) return dto;
  const active = await deps.presentations.listActiveBySupplier(organizationId, supplierId);
  if (active.length === 0) return { ...dto, lines: dto.lines.map((l) => ({ ...l, packaging: { presentation: null, preview: null, baseUnit: null } })) };
  const byKey = new Map(active.map((p) => {
    const x = p.toProps();
    return [PurchasePresentation.matchKey(x.supplierReference, normalizeDescription(x.description)), p] as const;
  }));
  const baseUnits = new Map<string, string | null>();
  const baseUnitOf = async (itemId: string) => {
    if (!baseUnits.has(itemId)) baseUnits.set(itemId, (await deps.catalog.findById(organizationId, itemId))?.baseUnit ?? null);
    return baseUnits.get(itemId)!;
  };
  const lines = await Promise.all(
    dto.lines.map(async (l) => {
      const p =
        (l.supplierItemCode ? byKey.get(PurchasePresentation.matchKey(l.supplierItemCode, "")) : undefined) ??
        byKey.get(PurchasePresentation.matchKey(null, normalizeDescription(l.description)));
      if (!p) return { ...l, packaging: { presentation: null, preview: null, baseUnit: null } };
      const x = p.toProps();
      const baseUnit = await baseUnitOf(x.stockItemId);
      const net = l.netAmount ?? Math.round(l.unitCostWithoutVat * l.purchaseQuantity);
      const preview = baseUnit ? invoiceLineToStock(x, l.purchaseQuantity, net, baseUnit, invoiceQuantityUnit(l.purchaseUnit, l.description)) : null;
      return { ...l, packaging: { presentation: toPurchasePresentationDTO(p), preview, baseUnit } };
    }),
  );
  return { ...dto, lines };
}
