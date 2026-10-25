import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { InvalidPurchasePresentationError } from "../../domain/errors.js";
import { PurchasePresentation } from "../../domain/entities/purchase-presentation.js";
import type {
  ListPurchasePresentationsPort,
  PurchasePresentationDTO,
  SavePurchasePresentationCommand,
  SavePurchasePresentationPort,
} from "../../domain/ports/in/stock-purchase-review.ports.js";
import type { PurchasePresentationRepositoryPort } from "../../domain/ports/out/purchase-presentation-repository.port.js";
import type { StockCatalogWritePort } from "../../domain/ports/out/stock-catalog-write.port.js";
import type { StockReviewLearnedMappingPort } from "../../domain/ports/out/stock-review-learned-mapping.port.js";
import type { StockReviewAuditLogPort } from "../../domain/ports/out/stock-review-audit-log.port.js";
import { unitFactor } from "../../domain/services/presentation-conversion.service.js";
import { normalizeDescription } from "./shared.js";

export function toPurchasePresentationDTO(p: PurchasePresentation): PurchasePresentationDTO {
  const x = p.toProps();
  return {
    id: x.id,
    supplierId: x.supplierId,
    supplierReference: x.supplierReference,
    description: x.description,
    stockItemId: x.stockItemId,
    packageUnit: x.packageUnit,
    contentQuantity: x.contentQuantity,
    contentUnit: x.contentUnit,
    invoicedBy: x.invoicedBy,
    minOrderPackages: x.minOrderPackages,
    orderIncrementPackages: x.orderIncrementPackages,
    source: x.source,
    confidence: x.confidence,
    createdBy: x.createdBy,
    createdAt: x.createdAt.toISOString(),
    supersededAt: x.supersededAt ? x.supersededAt.toISOString() : null,
  };
}

/**
 * Confirmar/alterar a apresentação de compra de um artigo deste fornecedor («1 saco = 2,5 kg»).
 * Cria sempre uma versão nova (a anterior fica fechada — movimentos antigos não mudam), valida que o
 * conteúdo se converte na unidade base do artigo e atualiza o mapeamento aprendido com o fator
 * correspondente (as próximas faturas já vêm propostas com ele).
 */
export class SavePurchasePresentationUseCase implements SavePurchasePresentationPort {
  constructor(
    private readonly repository: PurchasePresentationRepositoryPort,
    private readonly catalog: StockCatalogWritePort,
    private readonly learnedMapping: StockReviewLearnedMappingPort,
    private readonly auditLog: StockReviewAuditLogPort,
  ) {}

  async execute(command: SavePurchasePresentationCommand): Promise<PurchasePresentationDTO> {
    const item = await this.catalog.findById(command.organizationId, command.stockItemId);
    if (!item || !item.isActive) throw new InvalidPurchasePresentationError("o artigo de stock não existe ou está inativo");
    const toBase = unitFactor(command.contentUnit, item.baseUnit);
    if (toBase === null) {
      throw new InvalidPurchasePresentationError(`o conteúdo em ${command.contentUnit} não se converte na unidade do artigo (${item.baseUnit})`);
    }
    const next = PurchasePresentation.create({
      organizationId: command.organizationId,
      supplierId: command.supplierId,
      supplierReference: command.supplierReference,
      description: command.description,
      stockItemId: item.id,
      packageUnit: command.packageUnit,
      contentQuantity: command.contentQuantity,
      contentUnit: command.contentUnit,
      invoicedBy: command.invoicedBy,
      ...(command.minOrderPackages !== undefined && { minOrderPackages: command.minOrderPackages }),
      ...(command.orderIncrementPackages !== undefined && { orderIncrementPackages: command.orderIncrementPackages }),
      source: "user",
      confidence: 1,
      createdBy: command.actor,
    });
    const key = PurchasePresentation.matchKey(command.supplierReference, normalizeDescription(command.description));
    const previous = await this.repository.findActive(command.organizationId, command.supplierId, key);
    await this.repository.replaceActive(command.organizationId, key, next, previous);

    const p = next.toProps();
    await this.learnedMapping.learn(command.organizationId, {
      supplierId: p.supplierId,
      supplierReference: p.supplierReference,
      normalizedDescription: normalizeDescription(p.description),
      resolutionType: "existing_item",
      stockItemId: p.stockItemId,
      conversionFactor: p.invoicedBy === "package" ? p.contentQuantity * toBase : toBase,
      purchaseUnit: p.invoicedBy === "package" ? p.packageUnit : p.contentUnit,
    });
    await this.auditLog.record({
      organizationId: command.organizationId,
      actor: command.actor,
      entityType: "purchase_presentation",
      entityId: p.id,
      action: previous ? "presentation_changed" : "presentation_confirmed",
      ...(previous && { before: previous.toProps() }),
      after: p,
    });
    return toPurchasePresentationDTO(next);
  }
}

export class ListPurchasePresentationsUseCase implements ListPurchasePresentationsPort {
  constructor(private readonly repository: PurchasePresentationRepositoryPort) {}

  async execute(organizationId: OrganizationId, supplierId: string): Promise<PurchasePresentationDTO[]> {
    return (await this.repository.listActiveBySupplier(organizationId, supplierId)).map(toPurchasePresentationDTO);
  }
}
