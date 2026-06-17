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
      supplierId: command.supplierId,
      supplierName: command.supplierName,
      description: command.description,
      costCenterId: command.costCenterId,
      category: command.category,
      amount: command.amount,
      dueDate: new Date(command.dueDate),
      recurrence: command.recurrence,
      notes: command.notes,
    });
    await this.repo.save(entry);
    return toDTO(entry);
  }
}
