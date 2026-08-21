import { Recurrence } from "../../domain/entities/recurrence.js";
import type { RecurrenceRepositoryPort } from "../../domain/ports/out/recurrence-repository.port.js";
import type { CreateRecurrencePort, CreateRecurrenceCommand, RecurrenceDTO } from "../../domain/ports/in/recurrence.ports.js";
import { toRecurrenceDTO } from "./shared.js";

export class CreateRecurrenceUseCase implements CreateRecurrencePort {
  constructor(private readonly repo: RecurrenceRepositoryPort) {}

  async execute(command: CreateRecurrenceCommand): Promise<RecurrenceDTO> {
    const recurrence = Recurrence.create({
      name: command.name,
      supplierName: command.supplierName,
      type: command.type,
      estimatedAmountCents: command.estimatedAmountCents,
      dayOfMonth: command.dayOfMonth,
      startDate: new Date(command.startDate),
      paymentMethod: command.paymentMethod,
      ...(command.supplierId !== undefined && { supplierId: command.supplierId }),
      ...(command.frequency !== undefined && { frequency: command.frequency }),
      ...(command.costCenterId !== undefined && { costCenterId: command.costCenterId }),
      ...(command.costCenterCategoryId !== undefined && { costCenterCategoryId: command.costCenterCategoryId }),
      ...(command.category !== undefined && { category: command.category }),
      ...(command.endDate !== undefined && { endDate: command.endDate ? new Date(command.endDate) : null }),
      ...(command.autoCreatePayable !== undefined && { autoCreatePayable: command.autoCreatePayable }),
      ...(command.requireInvoice !== undefined && { requireInvoice: command.requireInvoice }),
      ...(command.notes !== undefined && { notes: command.notes }),
    });

    await this.repo.save(recurrence);
    return toRecurrenceDTO(recurrence);
  }
}
