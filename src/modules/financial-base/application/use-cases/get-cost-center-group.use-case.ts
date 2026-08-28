import { CostCenterGroupNotFoundError } from "../../domain/errors.js";
import type { CostCenterGroupRepositoryPort } from "../../domain/ports/out/cost-center-group-repository.port.js";
import type {
  CostCenterGroupDTO,
  GetCostCenterGroupCommand,
  GetCostCenterGroupPort,
} from "../../domain/ports/in/cost-center-group.ports.js";
import { toCostCenterGroupDTO } from "./shared.js";

export class GetCostCenterGroupUseCase implements GetCostCenterGroupPort {
  constructor(private readonly repository: CostCenterGroupRepositoryPort) {}

  async execute(command: GetCostCenterGroupCommand): Promise<CostCenterGroupDTO> {
    const group = await this.repository.findById(command.organizationId, command.id);
    if (!group) throw new CostCenterGroupNotFoundError(command.id);
    return toCostCenterGroupDTO(group);
  }
}
