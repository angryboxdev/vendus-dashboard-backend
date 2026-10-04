import { randomUUID } from "crypto";
import { EmployeeNotFoundError } from "../../domain/errors.js";
import type { EmployeeRepositoryPort } from "../../domain/ports/out/employee-repository.port.js";
import type { HrAuditLogPort } from "../../domain/ports/out/hr-audit-log.port.js";
import type { PositionRepositoryPort } from "../../domain/ports/out/position-repository.port.js";
import type { LocationRepositoryPort } from "../../../locations/domain/ports/out/location-repository.port.js";
import type { UpdateEmployeeCommand, UpdateEmployeePort, EmployeeDTO } from "../../domain/ports/in/employee.ports.js";
import { toEmployeeDTO } from "./shared.js";
import { resolveEmployeeAssignments } from "./employee-assignments.js";

/** Mudanças de cargo/local ficam no histórico do colaborador (antes/depois completo), como qualquer outra edição. */
export class UpdateEmployeeUseCase implements UpdateEmployeePort {
  constructor(
    private readonly employeeRepository: EmployeeRepositoryPort,
    private readonly auditLog: HrAuditLogPort,
    private readonly positionRepository: PositionRepositoryPort,
    private readonly locationRepository: LocationRepositoryPort,
  ) {}

  async execute(command: UpdateEmployeeCommand): Promise<EmployeeDTO> {
    const existing = await this.employeeRepository.findById(command.organizationId, command.id);
    if (!existing) throw new EmployeeNotFoundError(command.id);

    const { positionId, primaryLocationId, authorizedLocationIds, ...data } = command.data;
    const assignments = await resolveEmployeeAssignments(
      this.positionRepository,
      this.locationRepository,
      command.organizationId,
      {
        ...(positionId !== undefined && { positionId }),
        ...(primaryLocationId !== undefined && { primaryLocationId }),
        ...(authorizedLocationIds !== undefined && { authorizedLocationIds }),
      },
      existing,
    );

    const before = existing.toProps();
    const updated = existing.update({ ...data, ...assignments });
    const saved = await this.employeeRepository.update(command.organizationId, updated);

    const positionChanged = before.positionId !== saved.positionId;
    const locationChanged =
      before.primaryLocationId !== saved.primaryLocationId ||
      before.authorizedLocationIds.join(",") !== saved.authorizedLocationIds.join(",");

    await this.auditLog.record({
      organizationId: command.organizationId,
      actor: command.actor,
      entityType: "employee",
      entityId: saved.id,
      employeeId: saved.id,
      action: "employee_updated",
      description: [
        `Colaborador ${saved.fullName} atualizado`,
        ...(positionChanged ? ["cargo alterado"] : []),
        ...(locationChanged ? ["locais alterados"] : []),
      ].join(" — "),
      before,
      after: saved.toProps(),
      correlationId: randomUUID(),
    });

    return toEmployeeDTO(saved, "admin", null);
  }
}
