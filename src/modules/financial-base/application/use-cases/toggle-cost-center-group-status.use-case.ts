import { CostCenterGroupNotFoundError } from "../../domain/errors.js";
import type { CostCenterGroupRepositoryPort } from "../../domain/ports/out/cost-center-group-repository.port.js";
import type {
  CostCenterGroupDTO,
  ToggleCostCenterGroupStatusCommand,
  ToggleCostCenterGroupStatusPort,
} from "../../domain/ports/in/cost-center-group.ports.js";
import { toCostCenterGroupDTO } from "./shared.js";

export class ToggleCostCenterGroupStatusUseCase implements ToggleCostCenterGroupStatusPort {
  constructor(private readonly repository: CostCenterGroupRepositoryPort) {}

  async execute(command: ToggleCostCenterGroupStatusCommand): Promise<CostCenterGroupDTO> {
    const group = await this.repository.findById(command.id);
    if (!group) throw new CostCenterGroupNotFoundError(command.id);

    const updated = command.isActive ? group.activate() : group.deactivate();
    await this.repository.update(updated);
    return toCostCenterGroupDTO(updated);
  }
}
