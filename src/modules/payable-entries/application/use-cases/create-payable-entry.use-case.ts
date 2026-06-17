import { PayableEntry } from "../../domain/entities/payable-entry.js";
import type { PayableEntryRepositoryPort } from "../../domain/ports/out/payable-entry-repository.port.js";
import type {
  CreatePayableEntryPort,
  CreatePayableEntryCommand,
  PayableEntryDTO,
} from "../../domain/ports/in/payable-entry.ports.js";
import { toDTO } from "./shared.js";

export class CreatePayableEntryUseCase implements CreatePayableEntryPort {
  constructor(private readonly repo: PayableEntryRepositoryPort) {}

  async execute(command: CreatePayableEntryCommand): Promise<PayableEntryDTO> {
    const entry = PayableEntry.create({
      ...(command.supplierId !== undefined && { supplierId: command.supplierId }),
      supplierName: command.supplierName,
      description: command.description,
      ...(command.costCenterId !== undefined && { costCenterId: command.costCenterId }),
      ...(command.category !== undefined && { category: command.category }),
      amount: command.amount,
      dueDate: new Date(command.dueDate),
      ...(command.recurrence !== undefined && { recurrence: command.recurrence }),
      ...(command.notes !== undefined && { notes: command.notes }),
    });
    await this.repo.save(entry);
    return toDTO(entry);
  }
}
