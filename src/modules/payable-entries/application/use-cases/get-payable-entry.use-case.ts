import type { PayableEntryRepositoryPort } from "../../domain/ports/out/payable-entry-repository.port.js";
import type {
  GetPayableEntryPort,
  GetPayableEntryQuery,
  PayableEntryDTO,
} from "../../domain/ports/in/payable-entry.ports.js";
import { PayableEntryNotFoundError } from "../../domain/errors.js";
import { toDTO } from "./shared.js";

export class GetPayableEntryUseCase implements GetPayableEntryPort {
  constructor(private readonly repo: PayableEntryRepositoryPort) {}

  async execute(query: GetPayableEntryQuery): Promise<PayableEntryDTO> {
    const entry = await this.repo.findById(query.organizationId, query.id);
    if (!entry) throw new PayableEntryNotFoundError(query.id);
    return toDTO(entry);
  }
}
