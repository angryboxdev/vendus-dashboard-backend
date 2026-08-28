import type { PayableEntryRepositoryPort } from "../../domain/ports/out/payable-entry-repository.port.js";
import type {
  DeletePayableEntryPort,
  DeletePayableEntryCommand,
} from "../../domain/ports/in/payable-entry.ports.js";
import { PayableEntryNotFoundError, PayableEntryCannotDeleteError } from "../../domain/errors.js";

export class DeletePayableEntryUseCase implements DeletePayableEntryPort {
  constructor(private readonly repo: PayableEntryRepositoryPort) {}

  async execute(command: DeletePayableEntryCommand): Promise<void> {
    const { organizationId, id } = command;
    const entry = await this.repo.findById(organizationId, id);
    if (!entry) throw new PayableEntryNotFoundError(id);
    if (entry.status !== "cancelled") throw new PayableEntryCannotDeleteError(id);
    await this.repo.delete(organizationId, id);
  }
}
