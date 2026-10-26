import type { RecurrenceRepositoryPort } from "../../domain/ports/out/recurrence-repository.port.js";
import type { EmployeeDirectoryReadPort } from "../../domain/ports/out/employee-directory-read.port.js";
import type { UpdateRecurrencePort, UpdateRecurrenceCommand, RecurrenceDTO } from "../../domain/ports/in/recurrence.ports.js";
import { RecurrenceNotFoundError } from "../../domain/errors.js";
import { resolveEmployeePayee, toRecurrenceDTO } from "./shared.js";

export class UpdateRecurrenceUseCase implements UpdateRecurrencePort {
  constructor(
    private readonly repo: RecurrenceRepositoryPort,
    private readonly employees: EmployeeDirectoryReadPort,
  ) {}

  async execute(command: UpdateRecurrenceCommand): Promise<RecurrenceDTO> {
    const recurrence = await this.repo.findById(command.organizationId, command.id);
    if (!recurrence) throw new RecurrenceNotFoundError(command.id);

    // Só valida quando o colaborador muda — um colaborador entretanto inativo continua associado.
    const employee =
      command.employeeId && command.employeeId !== recurrence.employeeId
        ? await resolveEmployeePayee(this.employees, command.organizationId, command.employeeId)
        : null;
    const supplierName =
      command.supplierName !== undefined && !command.supplierName.trim() && employee
        ? employee.fullName
        : command.supplierName;

    const updated = recurrence.update({
      ...(command.name !== undefined && { name: command.name }),
      ...(command.supplierId !== undefined && { supplierId: command.supplierId }),
      ...(supplierName !== undefined && { supplierName }),
      ...(command.employeeId !== undefined && { employeeId: command.employeeId }),
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
      ...(command.vatRate !== undefined && { vatRate: command.vatRate }),
      ...(command.vatIncluded !== undefined && { vatIncluded: command.vatIncluded }),
    });

    await this.repo.update(command.organizationId, updated);
    return toRecurrenceDTO(updated);
  }
}
