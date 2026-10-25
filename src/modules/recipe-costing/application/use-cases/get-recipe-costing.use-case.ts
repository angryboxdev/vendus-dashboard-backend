import type { RecipeCostingReport } from "../../domain/entities/recipe-costing.js";
import type { GetRecipeCostingCommand, GetRecipeCostingPort } from "../../domain/ports/in/get-recipe-costing.port.js";
import type { RecipeCostingReadPort } from "../../domain/ports/out/recipe-costing-read.port.js";
import { computeRecipeCosting } from "../../domain/services/recipe-cost.service.js";

export class GetRecipeCostingUseCase implements GetRecipeCostingPort {
  constructor(private readonly reader: RecipeCostingReadPort) {}

  async execute(command: GetRecipeCostingCommand): Promise<RecipeCostingReport> {
    const snapshot = await this.reader.loadSnapshot(command.organizationId);
    return computeRecipeCosting(snapshot);
  }
}
