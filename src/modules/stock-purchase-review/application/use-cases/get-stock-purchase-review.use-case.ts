import { StockPurchaseReviewNotFoundError } from "../../domain/errors.js";
import type { GetStockPurchaseReviewCommand, GetStockPurchaseReviewPort, StockPurchaseReviewDTO } from "../../domain/ports/in/stock-purchase-review.ports.js";
import type { StockPurchaseReviewRepositoryPort } from "../../domain/ports/out/stock-purchase-review-repository.port.js";
import type { CostCenterCategoryReadPort } from "../../domain/ports/out/cost-center-category-read.port.js";
import { conferenceFor, toStockPurchaseReviewDTO } from "./shared.js";
import { withPackaging, type PackagingDeps } from "./shared-packaging.js";

export class GetStockPurchaseReviewUseCase implements GetStockPurchaseReviewPort {
  constructor(
    private readonly repository: StockPurchaseReviewRepositoryPort,
    /** F3a: conferências na leitura (sem esta porta a resposta vem sem `conference`). */
    private readonly categoryRead?: CostCenterCategoryReadPort,
    /** Embalagem de compra de cada linha (opcional nos testes antigos). */
    private readonly packaging?: PackagingDeps,
  ) {}

  async execute(command: GetStockPurchaseReviewCommand): Promise<StockPurchaseReviewDTO> {
    const review = await this.repository.findById(command.organizationId, command.id);
    if (!review) throw new StockPurchaseReviewNotFoundError(command.id);
    const lines = await this.repository.findLinesByReviewId(command.organizationId, command.id);
    const conference = this.categoryRead ? await conferenceFor(command.organizationId, review, lines, this.categoryRead) : undefined;
    return withPackaging(command.organizationId, toStockPurchaseReviewDTO(review, lines, conference), this.packaging);
  }
}
