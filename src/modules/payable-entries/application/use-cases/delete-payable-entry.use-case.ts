import type { PayableEntryRepositoryPort } from "../../domain/ports/out/payable-entry-repository.port.js";
import type { DeletePayableEntryPort } from "../../domain/ports/in/payable-entry.ports.js";
import { PayableEntryNotFoundError, PayableEntryCannotDeleteError } from "../../domain/errors.js";

export class DeletePayableEntryUseCase implements DeletePayableEntryPort {
  constructor(private readonly repo: PayableEntryRepositoryPort) {}

  async execute(id: string): Promise<void> {
    const entry = await this.repo.findById(id);
    if (!entry) throw new PayableEntryNotFoundError(id);
    if (entry.status !== "cancelled") throw new PayableEntryCannotDeleteError(id);
    await this.repo.delete(id);
  }
}
