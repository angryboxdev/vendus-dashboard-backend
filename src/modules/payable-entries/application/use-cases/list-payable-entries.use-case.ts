import type { PayableEntryRepositoryPort } from "../../domain/ports/out/payable-entry-repository.port.js";
import type {
  ListPayableEntriesPort,
  ListPayableEntriesFilter,
  PayableEntryDTO,
} from "../../domain/ports/in/payable-entry.ports.js";
import type { PayableStatus } from "../../domain/entities/payable-entry.js";
import { toDTO } from "./shared.js";

export class ListPayableEntriesUseCase implements ListPayableEntriesPort {
  constructor(private readonly repo: PayableEntryRepositoryPort) {}

  async execute(filter: ListPayableEntriesFilter): Promise<PayableEntryDTO[]> {
    const entries = await this.repo.findAll(filter.organizationId, {
      ...(filter.supplierId !== undefined && { supplierId: filter.supplierId }),
      ...(filter.costCenterId !== undefined && { costCenterId: filter.costCenterId }),
      ...(filter.status !== undefined && { status: filter.status as PayableStatus }),
      ...(filter.from !== undefined && { from: new Date(filter.from) }),
      ...(filter.to !== undefined && { to: new Date(filter.to) }),
    });
    return entries.map(toDTO);
  }
}
