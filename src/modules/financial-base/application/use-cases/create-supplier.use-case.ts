import { Supplier } from "../../domain/entities/supplier.js";
import type { SupplierRepositoryPort } from "../../domain/ports/out/supplier-repository.port.js";
import type {
  CreateSupplierCommand,
  CreateSupplierPort,
  SupplierDTO,
} from "../../domain/ports/in/supplier.ports.js";
import { toSupplierDTO } from "./shared.js";

export class CreateSupplierUseCase implements CreateSupplierPort {
  constructor(private readonly repository: SupplierRepositoryPort) {}

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
    });

    await this.repository.save(supplier);
    return toSupplierDTO(supplier);
  }
}
