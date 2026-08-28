import { CostCenterCategoryNotFoundError } from "../../domain/errors.js";
import type { CostCenterCategoryRepositoryPort } from "../../domain/ports/out/cost-center-category-repository.port.js";
import type {
  CostCenterCategoryDTO,
  ToggleCostCenterCategoryStatusCommand,
  ToggleCostCenterCategoryStatusPort,
} from "../../domain/ports/in/cost-center-category.ports.js";
import { toCostCenterCategoryDTO } from "./shared.js";

export class ToggleCostCenterCategoryStatusUseCase implements ToggleCostCenterCategoryStatusPort {
  constructor(private readonly repository: CostCenterCategoryRepositoryPort) {}

  async execute(command: ToggleCostCenterCategoryStatusCommand): Promise<CostCenterCategoryDTO> {
    const category = await this.repository.findById(command.organizationId, command.id);
    if (!category) throw new CostCenterCategoryNotFoundError(command.id);

    const updated = command.isActive ? category.activate() : category.deactivate();
    await this.repository.update(command.organizationId, updated);
    return toCostCenterCategoryDTO(updated);
  }
}
