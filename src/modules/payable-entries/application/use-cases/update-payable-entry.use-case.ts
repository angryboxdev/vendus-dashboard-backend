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
      ...(command.supplierName !== undefined && { supplierName: command.supplierName }),
      ...(command.description !== undefined && { description: command.description }),
      ...(command.costCenterId !== undefined && { costCenterId: command.costCenterId }),
      ...(command.category !== undefined && { category: command.category }),
      ...(command.amount !== undefined && { amount: command.amount }),
      ...(command.dueDate !== undefined && { dueDate: new Date(command.dueDate) }),
      ...(command.recurrence !== undefined && { recurrence: command.recurrence }),
      ...(command.notes !== undefined && { notes: command.notes }),
    });

    await this.repo.update(updated);
    return toDTO(updated);
  }
}
