import { SupplierNotFoundError } from "../../domain/errors.js";
import type { SupplierRepositoryPort } from "../../domain/ports/out/supplier-repository.port.js";
import type {
  GetSupplierCommand,
  GetSupplierPort,
  SupplierDTO,
} from "../../domain/ports/in/supplier.ports.js";
import { toSupplierDTO } from "./shared.js";

export class GetSupplierUseCase implements GetSupplierPort {
  constructor(private readonly repository: SupplierRepositoryPort) {}

  async execute(command: GetSupplierCommand): Promise<SupplierDTO> {
    const supplier = await this.repository.findById(command.organizationId, command.id);
    if (!supplier) throw new SupplierNotFoundError(command.id);
    return toSupplierDTO(supplier);
  }
}
