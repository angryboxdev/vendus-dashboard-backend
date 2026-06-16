import type {
  CostCenterFilter,
  CostCenterRepositoryPort,
} from "../../domain/ports/out/cost-center-repository.port.js";
import type {
  ListCostCentersCommand,
  ListCostCentersPort,
  CostCenterDTO,
} from "../../domain/ports/in/cost-center.ports.js";
import { toCostCenterDTO } from "./shared.js";

export class ListCostCentersUseCase implements ListCostCentersPort {
  constructor(private readonly repository: CostCenterRepositoryPort) {}

  async execute(command?: ListCostCentersCommand): Promise<CostCenterDTO[]> {
    const filter: CostCenterFilter = {};
    if (command?.category) filter.category = command.category;
    if (command?.status) filter.status = command.status;
    const costCenters = await this.repository.findAll(filter);
    return costCenters.map(toCostCenterDTO);
  }
}
