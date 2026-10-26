import { StockPurchaseReviewNotFoundError, StaleInvoiceSnapshotError, LocationRequiredError, DocumentNotReconciledError, StockImportNotValidatedError, SuspiciousConversionError } from "../../domain/errors.js";
import type { StockCatalogWritePort } from "../../domain/ports/out/stock-catalog-write.port.js";
import type { StockSettingsRepositoryPort } from "../../domain/ports/out/stock-settings-repository.port.js";
import { resolveEntryLocation } from "./stock-settings.use-case.js";
import { invoiceQuantityUnit, unitFactor } from "../../domain/services/presentation-conversion.service.js";
import type { CostCenterCategoryReadPort } from "../../domain/ports/out/cost-center-category-read.port.js";
import type { ReviewConference } from "../../domain/services/review-conference.service.js";
import type { ConfirmStockPurchaseReviewCommand, ConfirmStockPurchaseReviewPort, StockPurchaseReviewDTO } from "../../domain/ports/in/stock-purchase-review.ports.js";
import type { StockPurchaseReviewRepositoryPort } from "../../domain/ports/out/stock-purchase-review-repository.port.js";
import type { StockMovementWritePort } from "../../domain/ports/out/stock-movement-write.port.js";
import type { InvoiceReadPort } from "../../domain/ports/out/invoice-read.port.js";
import type { LocationReadPort } from "../../domain/ports/out/location-read.port.js";
import type { StockReviewAuditLogPort } from "../../domain/ports/out/stock-review-audit-log.port.js";
import { computeInvoiceSourceHash, conferenceFor, toStockPurchaseReviewDTO } from "./shared.js";

export class ConfirmStockPurchaseReviewUseCase implements ConfirmStockPurchaseReviewPort {
  constructor(
    private readonly repository: StockPurchaseReviewRepositoryPort,
    private readonly stockMovementWrite: StockMovementWritePort,
    private readonly invoiceRead: InvoiceReadPort,
    private readonly locationRead: LocationReadPort,
    private readonly auditLog: StockReviewAuditLogPort,
    /** F3a: conferências (documento bloqueia; categorias ficam como pendência). */
    private readonly categoryRead?: CostCenterCategoryReadPort,
    /** Unidade base dos artigos — travão de conversão (fatura em kg com 1 kg = 1 g). */
    private readonly catalog?: StockCatalogWritePort,
    /** V5 §2.4: localização principal do Stock (entradas sem perguntar a loja). */
    private readonly settings?: StockSettingsRepositoryPort,
  ) {}

  async execute(command: ConfirmStockPurchaseReviewCommand): Promise<StockPurchaseReviewDTO> {
    const review = await this.repository.findById(command.organizationId, command.id);
    if (!review) throw new StockPurchaseReviewNotFoundError(command.id);
    const before = review.toProps();

    // Revalida contra a fatura de origem (secção 14) — nunca aplica sobre divergência não validada.
    if (review.status !== "applied") {
      const invoice = await this.invoiceRead.getInvoice(command.organizationId, review.invoiceId);
      if (invoice) {
        const currentHash = computeInvoiceSourceHash(invoice.invoiceNumber, invoice.invoiceDate, invoice.lines);
        if (currentHash !== review.sourceHash) {
          throw new StaleInvoiceSnapshotError();
        }
      }
    }

    // F3a: diferença de base/IVA entre as linhas e a fatura impede movimentar; categoria não.
    let conference: ReviewConference | undefined;
    const done = review.status === "applied" || review.status === "excluded";
    if (!done && this.categoryRead) {
      const currentLines = await this.repository.findLinesByReviewId(command.organizationId, command.id);
      conference = await conferenceFor(command.organizationId, review, currentLines, this.categoryRead);
      if (conference.document.status === "mismatch") {
        throw new DocumentNotReconciledError(conference.document.netDifferenceCents ?? 0, conference.document.vatDifferenceCents ?? 0);
      }
    }
    // Travão: a fatura conta em kg/l e a conversão dá menos do que 1 kg/l na unidade do artigo.
    if (!done && this.catalog) {
      const lines = await this.repository.findLinesByReviewId(command.organizationId, command.id);
      for (const line of lines) {
        const p = line.toProps();
        if ((p.resolutionType !== "existing_item" && p.resolutionType !== "new_item") || !p.stockItemId || !p.conversionFactor) continue;
        const invoiceUnit = invoiceQuantityUnit(p.purchaseUnit, p.description);
        if (!invoiceUnit) continue;
        const item = await this.catalog.findById(command.organizationId, p.stockItemId);
        const expected = item ? unitFactor(invoiceUnit, item.baseUnit) : null;
        if (item && expected !== null && p.conversionFactor < expected) {
          throw new SuspiciousConversionError(p.description, p.conversionFactor, expected, invoiceUnit, item.baseUnit);
        }
      }
    }
    // F3c: importada no Stock e ainda sem lançamento no Financeiro → só com identidade e linhas conferidas.
    if (!done && review.financePending) {
      const p = review.toProps();
      if (!p.invoiceNumber.trim() || !p.supplierName.trim() || p.supplierName === "Fornecedor desconhecido") {
        throw new StockImportNotValidatedError("a fatura tem de ter fornecedor e número identificados");
      }
      if (conference?.document.status !== "ok") {
        throw new StockImportNotValidatedError("as linhas têm de bater com a base e o IVA da fatura");
      }
    }

    // Resolve a loja para linhas sem `locationId` próprio (secção 46 — nunca decidido pelo Centro de Custo).
    // V5 §2.4: a indicada, a única loja ativa ou a localização principal; com várias e sem principal recusa.
    let effectiveLocationId = command.locationId ?? review.locationId;
    if (!effectiveLocationId) {
      const activeLocations = await this.locationRead.listActive(command.organizationId);
      const defaultLocationId = activeLocations.length > 1 && this.settings ? await this.settings.getDefaultLocationId(command.organizationId) : null;
      effectiveLocationId = resolveEntryLocation(null, activeLocations, defaultLocationId);
      if (!effectiveLocationId && activeLocations.length > 1) throw new LocationRequiredError();
    }

    const effectiveDate = command.effectiveDate ?? review.toProps().invoiceDate;
    const result = await this.stockMovementWrite.confirmReview(
      command.organizationId,
      command.id,
      command.expectedVersion,
      command.actor,
      effectiveDate,
      effectiveLocationId,
    );

    const divergences = conference?.categories.divergences ?? [];
    if (!result.alreadyApplied && divergences.length > 0) {
      await this.repository.saveCategoryDivergences(command.organizationId, command.id, divergences);
    }

    const updated = await this.repository.findById(command.organizationId, command.id);
    if (!updated) throw new StockPurchaseReviewNotFoundError(command.id);
    const lines = await this.repository.findLinesByReviewId(command.organizationId, command.id);

    if (!result.alreadyApplied) {
      await this.auditLog.record({
        organizationId: command.organizationId,
        actor: command.actor,
        entityType: "stock_purchase_review",
        entityId: command.id,
        action: updated.status === "excluded" ? "confirm_excluded" : "confirm",
        before,
        after: updated.toProps(),
      });
    }

    return toStockPurchaseReviewDTO(updated, lines, conference);
  }
}
