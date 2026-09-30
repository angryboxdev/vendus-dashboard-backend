import { StockPurchaseReviewNotFoundError } from "../../domain/errors.js";
import type { GetStockPurchaseReviewCommand, GetStockPurchaseReviewPort, StockPurchaseReviewDTO } from "../../domain/ports/in/stock-purchase-review.ports.js";
import type { StockPurchaseReviewRepositoryPort } from "../../domain/ports/out/stock-purchase-review-repository.port.js";
import { toStockPurchaseReviewDTO } from "./shared.js";

export class GetStockPurchaseReviewUseCase implements GetStockPurchaseReviewPort {
  constructor(private readonly repository: StockPurchaseReviewRepositoryPort) {}

  async execute(command: GetStockPurchaseReviewCommand): Promise<StockPurchaseReviewDTO> {
    const review = await this.repository.findById(command.organizationId, command.id);
    if (!review) throw new StockPurchaseReviewNotFoundError(command.id);
    const lines = await this.repository.findLinesByReviewId(command.organizationId, command.id);
    return toStockPurchaseReviewDTO(review, lines);
  }
}
