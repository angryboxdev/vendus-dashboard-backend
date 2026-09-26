import { randomUUID } from "crypto";
import { EmployeeNotFoundError } from "../../domain/errors.js";
import type { EmployeeRepositoryPort } from "../../domain/ports/out/employee-repository.port.js";
import type { HrAuditLogPort } from "../../domain/ports/out/hr-audit-log.port.js";
import type {
  SetEmployeeStatusCommand,
  SetEmployeeStatusPort,
  EmployeeDTO,
} from "../../domain/ports/in/employee.ports.js";
import { toEmployeeDTO } from "./shared.js";

export class SetEmployeeStatusUseCase implements SetEmployeeStatusPort {
  constructor(
    private readonly employeeRepository: EmployeeRepositoryPort,
    private readonly auditLog: HrAuditLogPort,
  ) {}

  async execute(command: SetEmployeeStatusCommand): Promise<EmployeeDTO> {
    const existing = await this.employeeRepository.findById(command.organizationId, command.id);
    if (!existing) throw new EmployeeNotFoundError(command.id);

    const before = existing.toProps();
    const updated = command.status === "active" ? existing.activate() : existing.deactivate();
    const saved = await this.employeeRepository.update(command.organizationId, updated);

    await this.auditLog.record({
      organizationId: command.organizationId,
      actor: command.actor,
      entityType: "employee",
      entityId: saved.id,
      employeeId: saved.id,
      action: "employee_status_changed",
      description: `Colaborador ${saved.fullName}: estado alterado para "${saved.status}"`,
      before,
      after: saved.toProps(),
      correlationId: randomUUID(),
    });

    return toEmployeeDTO(saved, "admin", null);
  }
}
