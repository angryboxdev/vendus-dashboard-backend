import { CostCenterNotFoundError } from "../../domain/errors.js";
import type { CostCenterRepositoryPort } from "../../domain/ports/out/cost-center-repository.port.js";
import type {
  GetCostCenterCommand,
  GetCostCenterPort,
  CostCenterDTO,
} from "../../domain/ports/in/cost-center.ports.js";
import { toCostCenterDTO } from "./shared.js";

export class GetCostCenterUseCase implements GetCostCenterPort {
  constructor(private readonly repository: CostCenterRepositoryPort) {}

  async execute(command: GetCostCenterCommand): Promise<CostCenterDTO> {
    const costCenter = await this.repository.findById(command.id);
    if (!costCenter) throw new CostCenterNotFoundError(command.id);
    return toCostCenterDTO(costCenter);
  }
}
