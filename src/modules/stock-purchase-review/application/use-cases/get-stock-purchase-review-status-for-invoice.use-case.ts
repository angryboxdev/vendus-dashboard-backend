import type {
  GetStockPurchaseReviewStatusCommand,
  GetStockPurchaseReviewStatusPort,
  StockPurchaseReviewStatusSnapshotDTO,
} from "../../domain/ports/in/stock-purchase-review.ports.js";
import type { StockPurchaseReviewRepositoryPort } from "../../domain/ports/out/stock-purchase-review-repository.port.js";

/**
 * Leitura fina para `invoices` (D10) — reusa `findByInvoiceId`, nunca
 * duplica o CRUD deste módulo. Usado pelo guard de edição de fatura para
 * decidir se uma mudança de impacto em stock precisa de confirmação ou
 * deve ser bloqueada (ver `shared-stock-review-guard.ts` em `invoices`).
 */
export class GetStockPurchaseReviewStatusForInvoiceUseCase implements GetStockPurchaseReviewStatusPort {
  constructor(private readonly repository: StockPurchaseReviewRepositoryPort) {}

  async execute(command: GetStockPurchaseReviewStatusCommand): Promise<StockPurchaseReviewStatusSnapshotDTO | null> {
    const review = await this.repository.findByInvoiceId(command.organizationId, command.invoiceId);
    if (!review) return null;
    return { reviewId: review.id, status: review.status };
  }
}
