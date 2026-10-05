import { ReviewAlreadyAppliedError } from "../../domain/errors.js";
import type {
  DeleteDraftStockPurchaseReviewCommand,
  DeleteDraftStockPurchaseReviewPort,
  DeleteDraftStockPurchaseReviewResult,
} from "../../domain/ports/in/stock-purchase-review.ports.js";
import type { StockPurchaseReviewRepositoryPort } from "../../domain/ports/out/stock-purchase-review-repository.port.js";
import type { StockReviewAuditLogPort } from "../../domain/ports/out/stock-review-audit-log.port.js";

/**
 * Única exceção deliberada e estreita à regra "nunca hard delete" deste
 * módulo (ver README, Design decisions). Chamada por `invoices` (D10)
 * quando o utilizador confirma que quer mudar o impacto em stock duma
 * fatura e a revisão associada ainda não foi aplicada — nenhum movimento
 * real de stock foi gerado a partir dela, por isso não há nada de
 * real/auditado a preservar com um `cancel(reason)` normal. Idempotente:
 * sem revisão para a fatura é um no-op (`{deleted:false}`), nunca um erro.
 * Revisões `applied` nunca são apagadas — lançam `ReviewAlreadyAppliedError`,
 * espelhando `cancel()`.
 */
export class DeleteDraftStockPurchaseReviewUseCase implements DeleteDraftStockPurchaseReviewPort {
  constructor(
    private readonly repository: StockPurchaseReviewRepositoryPort,
    private readonly auditLog: StockReviewAuditLogPort,
  ) {}

  async execute(command: DeleteDraftStockPurchaseReviewCommand): Promise<DeleteDraftStockPurchaseReviewResult> {
    const review = await this.repository.findByInvoiceId(command.organizationId, command.invoiceId);
    if (!review) return { deleted: false };
    if (review.status === "applied") throw new ReviewAlreadyAppliedError(review.id);

    await this.auditLog.record({
      organizationId: command.organizationId,
      actor: command.actor,
      entityType: "stock_purchase_review",
      entityId: review.id,
      action: "draft_deleted_due_to_invoice_edit",
      before: review.toProps(),
      after: null,
    });

    await this.repository.hardDelete(command.organizationId, review.id);
    return { deleted: true };
  }
}
