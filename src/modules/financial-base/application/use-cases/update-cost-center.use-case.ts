import { CostCenterNotFoundError } from "../../domain/errors.js";
import type { CostCenterRepositoryPort } from "../../domain/ports/out/cost-center-repository.port.js";
import type {
  UpdateCostCenterCommand,
  UpdateCostCenterPort,
  CostCenterDTO,
} from "../../domain/ports/in/cost-center.ports.js";
import { toCostCenterDTO } from "./shared.js";

export class UpdateCostCenterUseCase implements UpdateCostCenterPort {
  constructor(private readonly repository: CostCenterRepositoryPort) {}

  async execute(command: UpdateCostCenterCommand): Promise<CostCenterDTO> {
    const costCenter = await this.repository.findById(command.id);
    if (!costCenter) throw new CostCenterNotFoundError(command.id);

    const updated = costCenter.update(command.data);
    await this.repository.update(updated);
    return toCostCenterDTO(updated);
  }
}
