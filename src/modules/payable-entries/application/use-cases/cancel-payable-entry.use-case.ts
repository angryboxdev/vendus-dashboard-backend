import type { PayableEntryRepositoryPort } from "../../domain/ports/out/payable-entry-repository.port.js";
import type {
  CancelPayableEntryPort,
  CancelPayableEntryCommand,
  PayableEntryDTO,
} from "../../domain/ports/in/payable-entry.ports.js";
import { PayableEntryNotFoundError } from "../../domain/errors.js";
import { toDTO } from "./shared.js";

export class CancelPayableEntryUseCase implements CancelPayableEntryPort {
  constructor(private readonly repo: PayableEntryRepositoryPort) {}

  async execute(command: CancelPayableEntryCommand): Promise<PayableEntryDTO> {
    const { organizationId, id } = command;
    const entry = await this.repo.findById(organizationId, id);
    if (!entry) throw new PayableEntryNotFoundError(id);

    const cancelled = entry.cancel();
    await this.repo.update(organizationId, cancelled);
    return toDTO(cancelled);
  }
}
