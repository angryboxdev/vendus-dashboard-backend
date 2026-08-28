import type { RecurrenceRepositoryPort } from "../../domain/ports/out/recurrence-repository.port.js";
import type { UpdateRecurrencePort, UpdateRecurrenceCommand, RecurrenceDTO } from "../../domain/ports/in/recurrence.ports.js";
import { RecurrenceNotFoundError } from "../../domain/errors.js";
import { toRecurrenceDTO } from "./shared.js";

export class UpdateRecurrenceUseCase implements UpdateRecurrencePort {
  constructor(private readonly repo: RecurrenceRepositoryPort) {}

  async execute(command: UpdateRecurrenceCommand): Promise<RecurrenceDTO> {
    const recurrence = await this.repo.findById(command.organizationId, command.id);
    if (!recurrence) throw new RecurrenceNotFoundError(command.id);

    const updated = recurrence.update({
      ...(command.name !== undefined && { name: command.name }),
      ...(command.supplierId !== undefined && { supplierId: command.supplierId }),
      ...(command.supplierName !== undefined && { supplierName: command.supplierName }),
      ...(command.costCenterId !== undefined && { costCenterId: command.costCenterId }),
      ...(command.costCenterCategoryId !== undefined && { costCenterCategoryId: command.costCenterCategoryId }),
      ...(command.category !== undefined && { category: command.category }),
      ...(command.estimatedAmountCents !== undefined && { estimatedAmountCents: command.estimatedAmountCents }),
      ...(command.dayOfMonth !== undefined && { dayOfMonth: command.dayOfMonth }),
      ...(command.endDate !== undefined && { endDate: command.endDate ? new Date(command.endDate) : null }),
      ...(command.paymentMethod !== undefined && { paymentMethod: command.paymentMethod }),
      ...(command.autoCreatePayable !== undefined && { autoCreatePayable: command.autoCreatePayable }),
      ...(command.requireInvoice !== undefined && { requireInvoice: command.requireInvoice }),
      ...(command.notes !== undefined && { notes: command.notes }),
    });

    await this.repo.update(command.organizationId, updated);
    return toRecurrenceDTO(updated);
  }
}
