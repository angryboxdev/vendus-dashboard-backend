import type { CostCenterCategoryRepositoryPort } from "../../domain/ports/out/cost-center-category-repository.port.js";
import type {
  CostCenterCategoryDTO,
  ListCostCenterCategoriesCommand,
  ListCostCenterCategoriesPort,
} from "../../domain/ports/in/cost-center-category.ports.js";
import { toCostCenterCategoryDTO } from "./shared.js";

export class ListCostCenterCategoriesUseCase implements ListCostCenterCategoriesPort {
  constructor(private readonly repository: CostCenterCategoryRepositoryPort) {}

  async execute(command: ListCostCenterCategoriesCommand): Promise<CostCenterCategoryDTO[]> {
    const filter: Parameters<typeof this.repository.findAll>[1] = {};
    if (command.groupId !== undefined) filter.groupId = command.groupId;
    if (command.isActive !== undefined) filter.isActive = command.isActive;
    const categories = await this.repository.findAll(command.organizationId, filter);
    return categories.map(toCostCenterCategoryDTO);
  }
}
