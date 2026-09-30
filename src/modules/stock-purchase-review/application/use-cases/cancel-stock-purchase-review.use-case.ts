import { StockPurchaseReviewNotFoundError } from "../../domain/errors.js";
import type { CancelStockPurchaseReviewCommand, CancelStockPurchaseReviewPort, StockPurchaseReviewDTO } from "../../domain/ports/in/stock-purchase-review.ports.js";
import type { StockPurchaseReviewRepositoryPort } from "../../domain/ports/out/stock-purchase-review-repository.port.js";
import type { StockReviewAuditLogPort } from "../../domain/ports/out/stock-review-audit-log.port.js";
import { toStockPurchaseReviewDTO } from "./shared.js";

/** Nunca hard delete — cancel(reason) é a única forma de "remover" uma revisão, sempre com motivo. */
export class CancelStockPurchaseReviewUseCase implements CancelStockPurchaseReviewPort {
  constructor(
    private readonly repository: StockPurchaseReviewRepositoryPort,
    private readonly auditLog: StockReviewAuditLogPort,
  ) {}

  async execute(command: CancelStockPurchaseReviewCommand): Promise<StockPurchaseReviewDTO> {
    const review = await this.repository.findById(command.organizationId, command.id);
    if (!review) throw new StockPurchaseReviewNotFoundError(command.id);

    const before = review.toProps();
    const cancelled = review.cancel(command.reason);
    await this.repository.save(command.organizationId, cancelled, command.expectedVersion);

    await this.auditLog.record({
      organizationId: command.organizationId,
      actor: command.actor,
      entityType: "stock_purchase_review",
      entityId: review.id,
      action: "cancel",
      before,
      after: cancelled.toProps(),
      reason: command.reason,
    });

    const lines = await this.repository.findLinesByReviewId(command.organizationId, command.id);
    return toStockPurchaseReviewDTO(cancelled, lines);
  }
}
