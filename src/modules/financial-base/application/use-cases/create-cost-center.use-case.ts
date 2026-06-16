import { CostCenter } from "../../domain/entities/cost-center.js";
import { CostCenterCodeAlreadyExistsError } from "../../domain/errors.js";
import type { CostCenterRepositoryPort } from "../../domain/ports/out/cost-center-repository.port.js";
import type {
  CreateCostCenterCommand,
  CreateCostCenterPort,
  CostCenterDTO,
} from "../../domain/ports/in/cost-center.ports.js";
import { toCostCenterDTO } from "./shared.js";

export class CreateCostCenterUseCase implements CreateCostCenterPort {
  constructor(private readonly repository: CostCenterRepositoryPort) {}

  async execute(command: CreateCostCenterCommand): Promise<CostCenterDTO> {
    const existing = await this.repository.findByCode(command.code);
    if (existing) throw new CostCenterCodeAlreadyExistsError(command.code);

    const costCenter = CostCenter.create({
      code: command.code,
      name: command.name,
      category: command.category,
      subcategory: command.subcategory ?? null,
      description: command.description ?? null,
      responsibleName: command.responsibleName ?? null,
    });

    await this.repository.save(costCenter);
    return toCostCenterDTO(costCenter);
  }
}
