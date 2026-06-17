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

  async execute(filter?: ListPayableEntriesFilter): Promise<PayableEntryDTO[]> {
    const entries = await this.repo.findAll({
      supplierId: filter?.supplierId,
      costCenterId: filter?.costCenterId,
      status: filter?.status as PayableStatus | undefined,
      from: filter?.from ? new Date(filter.from) : undefined,
      to: filter?.to ? new Date(filter.to) : undefined,
    });
    return entries.map(toDTO);
  }
}
