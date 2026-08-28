import { CostCenterCategoryNotFoundError } from "../../domain/errors.js";
import type { CostCenterCategoryRepositoryPort } from "../../domain/ports/out/cost-center-category-repository.port.js";
import type {
  CostCenterCategoryDTO,
  GetCostCenterCategoryCommand,
  GetCostCenterCategoryPort,
} from "../../domain/ports/in/cost-center-category.ports.js";
import { toCostCenterCategoryDTO } from "./shared.js";

export class GetCostCenterCategoryUseCase implements GetCostCenterCategoryPort {
  constructor(private readonly repository: CostCenterCategoryRepositoryPort) {}

  async execute(command: GetCostCenterCategoryCommand): Promise<CostCenterCategoryDTO> {
    const category = await this.repository.findById(command.organizationId, command.id);
    if (!category) throw new CostCenterCategoryNotFoundError(command.id);
    return toCostCenterCategoryDTO(category);
  }
}
