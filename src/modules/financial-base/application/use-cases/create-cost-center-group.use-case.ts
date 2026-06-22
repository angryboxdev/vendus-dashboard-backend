import { CostCenterGroup } from "../../domain/entities/cost-center-group.js";
import { CostCenterGroupCodeAlreadyExistsError } from "../../domain/errors.js";
import type { CostCenterGroupRepositoryPort } from "../../domain/ports/out/cost-center-group-repository.port.js";
import type {
  CostCenterGroupDTO,
  CreateCostCenterGroupCommand,
  CreateCostCenterGroupPort,
} from "../../domain/ports/in/cost-center-group.ports.js";
import { toCostCenterGroupDTO } from "./shared.js";

export class CreateCostCenterGroupUseCase implements CreateCostCenterGroupPort {
  constructor(private readonly repository: CostCenterGroupRepositoryPort) {}

  async execute(command: CreateCostCenterGroupCommand): Promise<CostCenterGroupDTO> {
    const existing = await this.repository.findByCode(command.code);
    if (existing) throw new CostCenterGroupCodeAlreadyExistsError(command.code);

    const group = CostCenterGroup.create({
      code: command.code,
      name: command.name,
      description: command.description ?? null,
      sortOrder: command.sortOrder ?? 0,
    });

    await this.repository.save(group);
    return toCostCenterGroupDTO(group);
  }
}
