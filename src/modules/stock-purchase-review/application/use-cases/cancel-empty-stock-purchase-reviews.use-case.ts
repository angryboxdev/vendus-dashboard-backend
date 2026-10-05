import type {
  CancelEmptyStockPurchaseReviewsCommand,
  CancelEmptyStockPurchaseReviewsPort,
  CancelEmptyStockPurchaseReviewsResult,
} from "../../domain/ports/in/stock-purchase-review.ports.js";
import type { StockPurchaseReviewRepositoryPort } from "../../domain/ports/out/stock-purchase-review-repository.port.js";
import type { StockReviewAuditLogPort } from "../../domain/ports/out/stock-review-audit-log.port.js";

export const EMPTY_REVIEW_CANCELLATION_REASON = "Fatura sem linhas — sem efeito no stock (regularização em lote)";

/**
 * Remediação em lote para revisões criadas antes do fix em
 * `RecordInvoiceFinalizedForStockUseCase` (30/09/2026) que passou a nunca
 * criar revisão sem linhas — sem nenhuma linha, `refreshLinesProgress`
 * nunca tem o gatilho que levaria o estado a "ready", e a revisão fica
 * presa para sempre em `pending`/`in_review`. Faz exatamente o mesmo que
 * cancelar uma a uma na UI (`cancel(reason)`, nunca hard delete, sempre
 * auditado) — só automatiza para não obrigar a repetir o clique dezenas
 * de vezes.
 */
export class CancelEmptyStockPurchaseReviewsUseCase implements CancelEmptyStockPurchaseReviewsPort {
  constructor(
    private readonly repository: StockPurchaseReviewRepositoryPort,
    private readonly auditLog: StockReviewAuditLogPort,
  ) {}

  async execute(command: CancelEmptyStockPurchaseReviewsCommand): Promise<CancelEmptyStockPurchaseReviewsResult> {
    const reviews = await this.repository.findAll(command.organizationId);
    const cancelled: CancelEmptyStockPurchaseReviewsResult["cancelled"] = [];

    for (const review of reviews) {
      if (review.status === "applied" || review.status === "cancelled") continue;

      const lines = await this.repository.findLinesByReviewId(command.organizationId, review.id);
      if (lines.length > 0) continue;

      const before = review.toProps();
      const updated = review.cancel(EMPTY_REVIEW_CANCELLATION_REASON);
      await this.repository.save(command.organizationId, updated, review.version);

      await this.auditLog.record({
        organizationId: command.organizationId,
        actor: command.actor,
        entityType: "stock_purchase_review",
        entityId: review.id,
        action: "cancel",
        before,
        after: updated.toProps(),
        reason: EMPTY_REVIEW_CANCELLATION_REASON,
      });

      cancelled.push({ id: review.id, invoiceNumber: before.invoiceNumber, supplierName: before.supplierName });
    }

    return { cancelledCount: cancelled.length, cancelled };
  }
}
