import { SupplierNotFoundError } from "../../domain/errors.js";
import type { SupplierRepositoryPort } from "../../domain/ports/out/supplier-repository.port.js";
import type {
  ToggleSupplierStatusCommand,
  ToggleSupplierStatusPort,
  SupplierDTO,
} from "../../domain/ports/in/supplier.ports.js";
import { toSupplierDTO } from "./shared.js";

export class ToggleSupplierStatusUseCase implements ToggleSupplierStatusPort {
  constructor(private readonly repository: SupplierRepositoryPort) {}

  async execute(command: ToggleSupplierStatusCommand): Promise<SupplierDTO> {
    const supplier = await this.repository.findById(command.organizationId, command.id);
    if (!supplier) throw new SupplierNotFoundError(command.id);

    const updated =
      command.status === "active" ? supplier.activate() : supplier.deactivate();

    await this.repository.update(command.organizationId, updated);
    return toSupplierDTO(updated);
  }
}
