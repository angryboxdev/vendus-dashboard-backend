import { randomUUID } from "crypto";
import { EmployeeNotFoundError } from "../../domain/errors.js";
import type { EmployeeRepositoryPort } from "../../domain/ports/out/employee-repository.port.js";
import type { HrAuditLogPort } from "../../domain/ports/out/hr-audit-log.port.js";
import type { UpdateEmployeeCommand, UpdateEmployeePort, EmployeeDTO } from "../../domain/ports/in/employee.ports.js";
import { toEmployeeDTO } from "./shared.js";

export class UpdateEmployeeUseCase implements UpdateEmployeePort {
  constructor(
    private readonly employeeRepository: EmployeeRepositoryPort,
    private readonly auditLog: HrAuditLogPort,
  ) {}

  async execute(command: UpdateEmployeeCommand): Promise<EmployeeDTO> {
    const existing = await this.employeeRepository.findById(command.organizationId, command.id);
    if (!existing) throw new EmployeeNotFoundError(command.id);

    const before = existing.toProps();
    const updated = existing.update(command.data);
    const saved = await this.employeeRepository.update(command.organizationId, updated);

    await this.auditLog.record({
      organizationId: command.organizationId,
      actor: command.actor,
      entityType: "employee",
      entityId: saved.id,
      employeeId: saved.id,
      action: "employee_updated",
      description: `Colaborador ${saved.fullName} atualizado`,
      before,
      after: saved.toProps(),
      correlationId: randomUUID(),
    });

    return toEmployeeDTO(saved, "admin", null);
  }
}
