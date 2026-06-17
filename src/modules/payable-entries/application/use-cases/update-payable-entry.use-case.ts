import type { PayableEntryRepositoryPort } from "../../domain/ports/out/payable-entry-repository.port.js";
import type {
  UpdatePayableEntryPort,
  UpdatePayableEntryCommand,
  PayableEntryDTO,
} from "../../domain/ports/in/payable-entry.ports.js";
import { PayableEntryNotFoundError } from "../../domain/errors.js";
import { toDTO } from "./shared.js";

export class UpdatePayableEntryUseCase implements UpdatePayableEntryPort {
  constructor(private readonly repo: PayableEntryRepositoryPort) {}

  async execute(command: UpdatePayableEntryCommand): Promise<PayableEntryDTO> {
    const entry = await this.repo.findById(command.id);
    if (!entry) throw new PayableEntryNotFoundError(command.id);

    const updated = entry.update({
      supplierName: command.supplierName,
      description: command.description,
      costCenterId: command.costCenterId,
      category: command.category,
      amount: command.amount,
      dueDate: command.dueDate ? new Date(command.dueDate) : undefined,
      recurrence: command.recurrence,
      notes: command.notes,
    });

    await this.repo.update(updated);
    return toDTO(updated);
  }
}
