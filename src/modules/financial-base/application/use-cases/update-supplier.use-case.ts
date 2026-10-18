import { SupplierNotFoundError } from "../../domain/errors.js";
import type { SupplierRepositoryPort } from "../../domain/ports/out/supplier-repository.port.js";
import type { CostCenterCategoryRepositoryPort } from "../../domain/ports/out/cost-center-category-repository.port.js";
import type { LocationReadPort } from "../../domain/ports/out/location-read.port.js";
import type {
  UpdateSupplierCommand,
  UpdateSupplierPort,
  SupplierDTO,
} from "../../domain/ports/in/supplier.ports.js";
import { toSupplierDTO } from "./shared.js";
import { assertSupplierDefaults } from "./shared-supplier-defaults.js";

export class UpdateSupplierUseCase implements UpdateSupplierPort {
  constructor(
    private readonly repository: SupplierRepositoryPort,
    private readonly categories: CostCenterCategoryRepositoryPort,
    private readonly locations: LocationReadPort,
  ) {}

  async execute(command: UpdateSupplierCommand): Promise<SupplierDTO> {
    const supplier = await this.repository.findById(command.organizationId, command.id);
    if (!supplier) throw new SupplierNotFoundError(command.id);

    const updated = supplier.update(command.data);
    await assertSupplierDefaults(this.categories, this.locations, command.organizationId, {
      costCenterGroupId: updated.defaultCostCenterGroupId,
      costCenterCategoryId: command.data.defaultCostCenterCategoryId !== undefined || command.data.defaultCostCenterGroupId !== undefined ? updated.defaultCostCenterCategoryId : null,
      locationId: command.data.defaultLocationId !== undefined ? updated.defaultLocationId : null,
    });
    await this.repository.update(command.organizationId, updated);
    return toSupplierDTO(updated);
  }
}
