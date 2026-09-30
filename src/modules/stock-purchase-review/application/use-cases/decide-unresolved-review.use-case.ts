import { StockPurchaseReviewNotFoundError } from "../../domain/errors.js";
import type { DecideUnresolvedReviewCommand, DecideUnresolvedReviewPort, StockPurchaseReviewDTO } from "../../domain/ports/in/stock-purchase-review.ports.js";
import type { StockPurchaseReviewRepositoryPort } from "../../domain/ports/out/stock-purchase-review-repository.port.js";
import type { StockReviewAuditLogPort } from "../../domain/ports/out/stock-review-audit-log.port.js";
import { toStockPurchaseReviewDTO } from "./shared.js";

/** A única forma de sair de `decisionSource: unresolved` (secção 8, Caso 5) — decisão explícita do gestor, sempre auditada. */
export class DecideUnresolvedReviewUseCase implements DecideUnresolvedReviewPort {
  constructor(
    private readonly repository: StockPurchaseReviewRepositoryPort,
    private readonly auditLog: StockReviewAuditLogPort,
  ) {}

  async execute(command: DecideUnresolvedReviewCommand): Promise<StockPurchaseReviewDTO> {
    const review = await this.repository.findById(command.organizationId, command.reviewId);
    if (!review) throw new StockPurchaseReviewNotFoundError(command.reviewId);

    const before = review.toProps();
    const updated = review.decideUnresolved(command.outcome, command.actor);
    await this.repository.save(command.organizationId, updated, command.expectedVersion);

    await this.auditLog.record({
      organizationId: command.organizationId,
      actor: command.actor,
      entityType: "stock_purchase_review",
      entityId: review.id,
      action: "decide_unresolved",
      before,
      after: updated.toProps(),
    });

    const lines = await this.repository.findLinesByReviewId(command.organizationId, command.reviewId);
    return toStockPurchaseReviewDTO(updated, lines);
  }
}
