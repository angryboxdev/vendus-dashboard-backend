import type {
  SuggestLineClassificationPort,
  SuggestClassificationResult,
} from "../../domain/ports/in/invoice.ports.js";
import type { ClassificationRuleRepositoryPort } from "../../domain/ports/out/classification-rule-repository.port.js";

export class SuggestLineClassificationUseCase implements SuggestLineClassificationPort {
  constructor(private readonly ruleRepo: ClassificationRuleRepositoryPort) {}

  async execute(supplierId: string): Promise<SuggestClassificationResult | null> {
    const rule = await this.ruleRepo.findBySupplierId(supplierId);
    if (!rule) return null;

    // Base score 0.5 + up to 0.5 from confidence boost
    const confidenceScore = 0.5 + (rule.confidenceBoost / 100) * 0.5;

    return {
      costCenterId: rule.defaultCostCenterId,
      lineType: rule.defaultLineType,
      category: rule.defaultCategory,
      confidenceScore,
    };
  }
}
