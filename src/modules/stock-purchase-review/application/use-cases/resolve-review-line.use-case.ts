import { StockPurchaseReviewNotFoundError, InvalidReviewLineResolutionError, InactiveStockItemReferencedError } from "../../domain/errors.js";
import type { ResolveReviewLineCommand, ResolveReviewLinePort, StockPurchaseReviewDTO } from "../../domain/ports/in/stock-purchase-review.ports.js";
import type { StockPurchaseReviewRepositoryPort } from "../../domain/ports/out/stock-purchase-review-repository.port.js";
import type { StockCatalogWritePort } from "../../domain/ports/out/stock-catalog-write.port.js";
import type { StockReviewLearnedMappingPort } from "../../domain/ports/out/stock-review-learned-mapping.port.js";
import type { StockReviewAuditLogPort } from "../../domain/ports/out/stock-review-audit-log.port.js";
import { validateConversion } from "../../domain/services/unit-conversion.service.js";
import type { LocationReadPort } from "../../domain/ports/out/location-read.port.js";
import type { CostCenterCategoryReadPort } from "../../domain/ports/out/cost-center-category-read.port.js";
import { conferenceFor, toStockPurchaseReviewDTO, normalizeDescription } from "./shared.js";

export class ResolveReviewLineUseCase implements ResolveReviewLinePort {
  constructor(
    private readonly repository: StockPurchaseReviewRepositoryPort,
    private readonly stockCatalogWrite: StockCatalogWritePort,
    private readonly learnedMapping: StockReviewLearnedMappingPort,
    private readonly auditLog: StockReviewAuditLogPort,
    /** F3a: valida as lojas da divisão (ativas na organização). */
    private readonly locationRead?: LocationReadPort,
    private readonly categoryRead?: CostCenterCategoryReadPort,
  ) {}

  async execute(command: ResolveReviewLineCommand): Promise<StockPurchaseReviewDTO> {
    const review = await this.repository.findById(command.organizationId, command.reviewId);
    if (!review) throw new StockPurchaseReviewNotFoundError(command.reviewId);

    const lines = await this.repository.findLinesByReviewId(command.organizationId, command.reviewId);
    const line = lines.find((l) => l.id === command.lineId);
    if (!line) throw new InvalidReviewLineResolutionError(`linha "${command.lineId}" não encontrada`);

    let resolvedLine;
    if (command.resolution === "no_stock_effect") {
      resolvedLine = line.resolveAsNoStockEffect(command.actor);
      const p = review.toProps();
      if (p.decisionSupplierId) {
        await this.learnedMapping.learn(command.organizationId, {
          supplierId: p.decisionSupplierId,
          supplierReference: line.supplierItemCode,
          normalizedDescription: normalizeDescription(resolvedLine.toProps().description),
          resolutionType: "no_stock_effect",
        });
      }
    } else {
      const conversionFactor = command.conversionFactor;
      if (conversionFactor === undefined) {
        throw new InvalidReviewLineResolutionError("conversionFactor é obrigatório para existing_item/new_item");
      }

      let stockItemId: string;
      let baseUnit: string;
      if (command.resolution === "new_item") {
        if (!command.newItem) throw new InvalidReviewLineResolutionError("newItem é obrigatório para new_item");
        const created = await this.stockCatalogWrite.create(command.organizationId, command.newItem);
        stockItemId = created.id;
        baseUnit = created.baseUnit;
      } else {
        if (!command.stockItemId) throw new InvalidReviewLineResolutionError("stockItemId é obrigatório para existing_item");
        const item = await this.stockCatalogWrite.findById(command.organizationId, command.stockItemId);
        if (!item) throw new InvalidReviewLineResolutionError(`item de stock "${command.stockItemId}" não encontrado`);
        if (!item.isActive) throw new InactiveStockItemReferencedError(command.stockItemId);
        stockItemId = item.id;
        baseUnit = item.baseUnit;
      }

      const splits = command.locationSplits && command.locationSplits.length > 0 ? command.locationSplits : null;
      if (splits && this.locationRead) {
        const active = new Set((await this.locationRead.listActive(command.organizationId)).map((l) => l.id));
        const unknown = splits.find((sp) => !active.has(sp.locationId));
        if (unknown) throw new InvalidReviewLineResolutionError(`a loja "${unknown.locationId}" não existe ou está inativa`);
      }

      const conversionCheck = validateConversion(line.toProps().purchaseUnit, baseUnit);
      resolvedLine = line.resolveToStockItem(
        {
          stockItemId,
          conversionFactor,
          ...(command.locationId !== undefined && { locationId: command.locationId }),
          ...(splits && { locationSplits: splits }),
          isItemActive: true,
          flaggedSuspiciousConversion: conversionCheck.flagged,
          flagReason: conversionCheck.reason,
        },
        command.resolution === "new_item",
        command.actor,
      );

      const p = review.toProps();
      if (p.decisionSupplierId && command.resolution === "existing_item") {
        await this.learnedMapping.learn(command.organizationId, {
          supplierId: p.decisionSupplierId,
          supplierReference: line.supplierItemCode,
          normalizedDescription: normalizeDescription(resolvedLine.toProps().description),
          resolutionType: "existing_item",
          stockItemId,
          conversionFactor,
          purchaseUnit: resolvedLine.toProps().purchaseUnit,
        });
      }
    }

    await this.repository.saveLine(command.organizationId, resolvedLine);

    const updatedLines = lines.map((l) => (l.id === resolvedLine.id ? resolvedLine : l));
    const allResolved = updatedLines.every((l) => l.resolutionType !== "unresolved");
    const anyResolved = updatedLines.some((l) => l.resolutionType !== "unresolved");
    const updatedReview = review.refreshLinesProgress(allResolved, anyResolved);
    if (updatedReview !== review) {
      await this.repository.save(command.organizationId, updatedReview, command.expectedVersion);
    }

    await this.auditLog.record({
      organizationId: command.organizationId,
      actor: command.actor,
      entityType: "stock_purchase_review",
      entityId: review.id,
      action: "resolve_line",
      after: resolvedLine.toProps(),
    });

    const conference = this.categoryRead ? await conferenceFor(command.organizationId, updatedReview, updatedLines, this.categoryRead) : undefined;
    return toStockPurchaseReviewDTO(updatedReview, updatedLines, conference);
  }
}
