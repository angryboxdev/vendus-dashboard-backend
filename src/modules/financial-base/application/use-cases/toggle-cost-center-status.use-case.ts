import { CostCenterNotFoundError } from "../../domain/errors.js";
import type { CostCenterRepositoryPort } from "../../domain/ports/out/cost-center-repository.port.js";
import type {
  ToggleCostCenterStatusCommand,
  ToggleCostCenterStatusPort,
  CostCenterDTO,
} from "../../domain/ports/in/cost-center.ports.js";
import { toCostCenterDTO } from "./shared.js";

export class ToggleCostCenterStatusUseCase implements ToggleCostCenterStatusPort {
  constructor(private readonly repository: CostCenterRepositoryPort) {}

  async execute(command: ToggleCostCenterStatusCommand): Promise<CostCenterDTO> {
    const costCenter = await this.repository.findById(command.id);
    if (!costCenter) throw new CostCenterNotFoundError(command.id);

    const updated =
      command.status === "active" ? costCenter.activate() : costCenter.deactivate();

    await this.repository.update(updated);
    return toCostCenterDTO(updated);
  }
}
