import { SupplierNotFoundError } from "../../domain/errors.js";
import type { SupplierRepositoryPort } from "../../domain/ports/out/supplier-repository.port.js";
import type {
  UpdateSupplierCommand,
  UpdateSupplierPort,
  SupplierDTO,
} from "../../domain/ports/in/supplier.ports.js";
import { toSupplierDTO } from "./shared.js";

export class UpdateSupplierUseCase implements UpdateSupplierPort {
  constructor(private readonly repository: SupplierRepositoryPort) {}

  async execute(command: UpdateSupplierCommand): Promise<SupplierDTO> {
    const supplier = await this.repository.findById(command.organizationId, command.id);
    if (!supplier) throw new SupplierNotFoundError(command.id);

    const updated = supplier.update(command.data);
    await this.repository.update(command.organizationId, updated);
    return toSupplierDTO(updated);
  }
}
