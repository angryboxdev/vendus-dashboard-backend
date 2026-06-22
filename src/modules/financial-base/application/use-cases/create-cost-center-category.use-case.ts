import { CostCenterCategory } from "../../domain/entities/cost-center-category.js";
import {
  CostCenterCategoryCodeAlreadyExistsError,
  CostCenterGroupNotFoundError,
} from "../../domain/errors.js";
import type { CostCenterGroupRepositoryPort } from "../../domain/ports/out/cost-center-group-repository.port.js";
import type { CostCenterCategoryRepositoryPort } from "../../domain/ports/out/cost-center-category-repository.port.js";
import type {
  CostCenterCategoryDTO,
  CreateCostCenterCategoryCommand,
  CreateCostCenterCategoryPort,
} from "../../domain/ports/in/cost-center-category.ports.js";
import { toCostCenterCategoryDTO } from "./shared.js";

export class CreateCostCenterCategoryUseCase implements CreateCostCenterCategoryPort {
  constructor(
    private readonly groupRepository: CostCenterGroupRepositoryPort,
    private readonly categoryRepository: CostCenterCategoryRepositoryPort,
  ) {}

  async execute(command: CreateCostCenterCategoryCommand): Promise<CostCenterCategoryDTO> {
    const group = await this.groupRepository.findById(command.groupId);
    if (!group) throw new CostCenterGroupNotFoundError(command.groupId);

    const existing = await this.categoryRepository.findByCode(command.code);
    if (existing) throw new CostCenterCategoryCodeAlreadyExistsError(command.code);

    const category = CostCenterCategory.create({
      groupId: command.groupId,
      code: command.code,
      name: command.name,
      financialType: command.financialType,
      affectsDre: command.affectsDre,
      affectsCashflow: command.affectsCashflow,
      affectsProfitability: command.affectsProfitability,
      requiresChannel: command.requiresChannel ?? false,
      requiresAllocation: command.requiresAllocation ?? false,
      description: command.description ?? null,
    });

    await this.categoryRepository.save(category);
    return toCostCenterCategoryDTO(category);
  }
}
