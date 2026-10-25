import { StockPurchaseReviewNotFoundError } from "../../domain/errors.js";
import type { RestoreStockPurchaseReviewCommand, RestoreStockPurchaseReviewPort, StockPurchaseReviewDTO } from "../../domain/ports/in/stock-purchase-review.ports.js";
import type { StockPurchaseReviewRepositoryPort } from "../../domain/ports/out/stock-purchase-review-repository.port.js";
import type { StockReviewAuditLogPort } from "../../domain/ports/out/stock-review-audit-log.port.js";
import { toStockPurchaseReviewDTO } from "./shared.js";

/** «Repor em Compras por rever» (F3b): desfaz uma retirada, com auditoria; nunca repete movimentos (uma retirada não os tem). */
export class RestoreStockPurchaseReviewUseCase implements RestoreStockPurchaseReviewPort {
  constructor(
    private readonly repository: StockPurchaseReviewRepositoryPort,
    private readonly auditLog: StockReviewAuditLogPort,
  ) {}

  async execute(command: RestoreStockPurchaseReviewCommand): Promise<StockPurchaseReviewDTO> {
    const review = await this.repository.findById(command.organizationId, command.id);
    if (!review) throw new StockPurchaseReviewNotFoundError(command.id);
    const lines = await this.repository.findLinesByReviewId(command.organizationId, command.id);
    const before = review.toProps();
    const restored = review.restore(
      lines.length > 0 && lines.every((l) => l.resolutionType !== "unresolved"),
      lines.some((l) => l.resolutionType !== "unresolved"),
    );
    await this.repository.save(command.organizationId, restored, command.expectedVersion);
    await this.auditLog.record({
      organizationId: command.organizationId,
      actor: command.actor,
      entityType: "stock_purchase_review",
      entityId: review.id,
      action: "restore",
      before,
      after: restored.toProps(),
    });
    return toStockPurchaseReviewDTO(restored, lines);
  }
}
