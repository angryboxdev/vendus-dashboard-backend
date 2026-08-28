import { CostCenterCategoryNotFoundError } from "../../domain/errors.js";
import type { CostCenterCategoryRepositoryPort } from "../../domain/ports/out/cost-center-category-repository.port.js";
import type {
  CostCenterCategoryDTO,
  UpdateCostCenterCategoryCommand,
  UpdateCostCenterCategoryPort,
} from "../../domain/ports/in/cost-center-category.ports.js";
import { toCostCenterCategoryDTO } from "./shared.js";

export class UpdateCostCenterCategoryUseCase implements UpdateCostCenterCategoryPort {
  constructor(private readonly repository: CostCenterCategoryRepositoryPort) {}

  async execute(command: UpdateCostCenterCategoryCommand): Promise<CostCenterCategoryDTO> {
    const category = await this.repository.findById(command.organizationId, command.id);
    if (!category) throw new CostCenterCategoryNotFoundError(command.id);

    const updated = category.update(command.data);
    await this.repository.update(command.organizationId, updated);
    return toCostCenterCategoryDTO(updated);
  }
}
