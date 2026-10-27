import { Recurrence } from "../../domain/entities/recurrence.js";
import type { RecurrenceRepositoryPort } from "../../domain/ports/out/recurrence-repository.port.js";
import type { EmployeeDirectoryReadPort } from "../../domain/ports/out/employee-directory-read.port.js";
import type { CreateRecurrencePort, CreateRecurrenceCommand, RecurrenceDTO } from "../../domain/ports/in/recurrence.ports.js";
import { resolveEmployeePayee, toRecurrenceDTO } from "./shared.js";

export class CreateRecurrenceUseCase implements CreateRecurrencePort {
  constructor(
    private readonly repo: RecurrenceRepositoryPort,
    private readonly employees: EmployeeDirectoryReadPort,
  ) {}

  async execute(command: CreateRecurrenceCommand): Promise<RecurrenceDTO> {
    const employee = command.employeeId
      ? await resolveEmployeePayee(this.employees, command.organizationId, command.employeeId)
      : null;

    const recurrence = Recurrence.create({
      name: command.name,
      // Salários: sem nome de beneficiário escrito, o beneficiário é o colaborador.
      supplierName: command.supplierName?.trim() ? command.supplierName : (employee?.fullName ?? ""),
      type: command.type,
      estimatedAmountCents: command.estimatedAmountCents,
      dayOfMonth: command.dayOfMonth,
      startDate: new Date(command.startDate),
      paymentMethod: command.paymentMethod,
      ...(command.supplierId !== undefined && { supplierId: command.supplierId }),
      ...(employee && { employeeId: employee.id }),
      ...(command.frequency !== undefined && { frequency: command.frequency }),
      ...(command.costCenterId !== undefined && { costCenterId: command.costCenterId }),
      ...(command.costCenterCategoryId !== undefined && { costCenterCategoryId: command.costCenterCategoryId }),
      ...(command.category !== undefined && { category: command.category }),
      ...(command.endDate !== undefined && { endDate: command.endDate ? new Date(command.endDate) : null }),
      ...(command.autoCreatePayable !== undefined && { autoCreatePayable: command.autoCreatePayable }),
      ...(command.requireInvoice !== undefined && { requireInvoice: command.requireInvoice }),
      ...(command.notes !== undefined && { notes: command.notes }),
      ...(command.paymentPeriodOffset !== undefined && { paymentPeriodOffset: command.paymentPeriodOffset }),
    });

    await this.repo.save(command.organizationId, recurrence);
    return toRecurrenceDTO(recurrence);
  }
}
