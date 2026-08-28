import { CostCenterGroupNotFoundError } from "../../domain/errors.js";
import type { CostCenterGroupRepositoryPort } from "../../domain/ports/out/cost-center-group-repository.port.js";
import type {
  CostCenterGroupDTO,
  UpdateCostCenterGroupCommand,
  UpdateCostCenterGroupPort,
} from "../../domain/ports/in/cost-center-group.ports.js";
import { toCostCenterGroupDTO } from "./shared.js";

export class UpdateCostCenterGroupUseCase implements UpdateCostCenterGroupPort {
  constructor(private readonly repository: CostCenterGroupRepositoryPort) {}

  async execute(command: UpdateCostCenterGroupCommand): Promise<CostCenterGroupDTO> {
    const group = await this.repository.findById(command.organizationId, command.id);
    if (!group) throw new CostCenterGroupNotFoundError(command.id);

    const updated = group.update(command.data);
    await this.repository.update(command.organizationId, updated);
    return toCostCenterGroupDTO(updated);
  }
}
