import type {
  SupplierFilter,
  SupplierRepositoryPort,
} from "../../domain/ports/out/supplier-repository.port.js";
import type {
  ListSuppliersCommand,
  ListSuppliersPort,
  SupplierDTO,
} from "../../domain/ports/in/supplier.ports.js";
import { toSupplierDTO } from "./shared.js";

export class ListSuppliersUseCase implements ListSuppliersPort {
  constructor(private readonly repository: SupplierRepositoryPort) {}

  async execute(command?: ListSuppliersCommand): Promise<SupplierDTO[]> {
    const filter: SupplierFilter = {};
    if (command?.status) filter.status = command.status;
    if (command?.search) filter.search = command.search;
    const suppliers = await this.repository.findAll(filter);
    return suppliers.map(toSupplierDTO);
  }
}
