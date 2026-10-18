import { Supplier } from "../../domain/entities/supplier.js";
import type { SupplierRepositoryPort } from "../../domain/ports/out/supplier-repository.port.js";
import type {
  CreateSupplierCommand,
  CreateSupplierPort,
  SupplierDTO,
} from "../../domain/ports/in/supplier.ports.js";
import { toSupplierDTO } from "./shared.js";
import { assertSupplierDefaults } from "./shared-supplier-defaults.js";
import type { CostCenterCategoryRepositoryPort } from "../../domain/ports/out/cost-center-category-repository.port.js";
import type { LocationReadPort } from "../../domain/ports/out/location-read.port.js";

export class CreateSupplierUseCase implements CreateSupplierPort {
  constructor(
    private readonly repository: SupplierRepositoryPort,
    private readonly categories: CostCenterCategoryRepositoryPort,
    private readonly locations: LocationReadPort,
  ) {}

  async execute(command: CreateSupplierCommand): Promise<SupplierDTO> {
    const supplier = Supplier.create({
      name: command.name,
      nif: command.nif ?? null,
      email: command.email ?? null,
      phone: command.phone ?? null,
      address: command.address ?? null,
      iban: command.iban ?? null,
      defaultCostCenterGroupId: command.defaultCostCenterGroupId ?? null,
      defaultCostCenterCategoryId: command.defaultCostCenterCategoryId ?? null,
      paymentTermsDays: command.paymentTermsDays ?? null,
      notes: command.notes ?? null,
      ...(command.defaultStockPolicy !== undefined && { defaultStockPolicy: command.defaultStockPolicy }),
      defaultFinancialType: command.defaultFinancialType ?? null,
      defaultFinancialMode: command.defaultFinancialMode ?? null,
      defaultLocationId: command.defaultLocationId ?? null,
    });
    await assertSupplierDefaults(this.categories, this.locations, command.organizationId, {
      costCenterGroupId: supplier.defaultCostCenterGroupId,
      costCenterCategoryId: supplier.defaultCostCenterCategoryId,
      locationId: supplier.defaultLocationId,
    });

    await this.repository.save(command.organizationId, supplier);
    return toSupplierDTO(supplier);
  }
}
