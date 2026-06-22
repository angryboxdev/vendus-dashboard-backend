import type { CostCenterGroupRepositoryPort } from "../../domain/ports/out/cost-center-group-repository.port.js";
import type {
  CostCenterGroupDTO,
  ListCostCenterGroupsCommand,
  ListCostCenterGroupsPort,
} from "../../domain/ports/in/cost-center-group.ports.js";
import { toCostCenterGroupDTO } from "./shared.js";

export class ListCostCenterGroupsUseCase implements ListCostCenterGroupsPort {
  constructor(private readonly repository: CostCenterGroupRepositoryPort) {}

  async execute(command?: ListCostCenterGroupsCommand): Promise<CostCenterGroupDTO[]> {
    const groups = await this.repository.findAll(
      command?.isActive !== undefined ? { isActive: command.isActive } : undefined,
    );
    return groups.map(toCostCenterGroupDTO);
  }
}
