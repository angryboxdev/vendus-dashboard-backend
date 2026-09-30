import { StockPurchaseReviewNotFoundError, InvalidReviewLineResolutionError } from "../../domain/errors.js";
import type { SuggestLineMappingCommand, SuggestLineMappingPort, SuggestedMappingDTO } from "../../domain/ports/in/stock-purchase-review.ports.js";
import type { StockPurchaseReviewRepositoryPort } from "../../domain/ports/out/stock-purchase-review-repository.port.js";
import type { StockReviewLearnedMappingPort } from "../../domain/ports/out/stock-review-learned-mapping.port.js";
import { normalizeDescription } from "./shared.js";

/** Nunca aplica sozinho — só devolve a sugestão para o utilizador confirmar (secção 28 da task). */
export class SuggestLineMappingUseCase implements SuggestLineMappingPort {
  constructor(
    private readonly repository: StockPurchaseReviewRepositoryPort,
    private readonly learnedMapping: StockReviewLearnedMappingPort,
  ) {}

  async execute(command: SuggestLineMappingCommand): Promise<SuggestedMappingDTO | null> {
    const review = await this.repository.findById(command.organizationId, command.reviewId);
    if (!review) throw new StockPurchaseReviewNotFoundError(command.reviewId);

    const lines = await this.repository.findLinesByReviewId(command.organizationId, command.reviewId);
    const line = lines.find((l) => l.id === command.lineId);
    if (!line) throw new InvalidReviewLineResolutionError(`linha "${command.lineId}" não encontrada`);

    const supplierId = review.toProps().decisionSupplierId;
    if (!supplierId) return null;

    const suggestion = await this.learnedMapping.suggest(
      command.organizationId,
      supplierId,
      null,
      normalizeDescription(line.toProps().description),
    );
    return suggestion
      ? {
          resolutionType: suggestion.resolutionType,
          stockItemId: suggestion.stockItemId,
          conversionFactor: suggestion.conversionFactor,
          purchaseUnit: suggestion.purchaseUnit,
          isItemActive: suggestion.isItemActive,
        }
      : null;
  }
}
