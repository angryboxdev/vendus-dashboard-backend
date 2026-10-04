import { randomUUID } from "crypto";
import { Employee } from "../../domain/entities/employee.js";
import type { EmployeeRepositoryPort } from "../../domain/ports/out/employee-repository.port.js";
import type { HrAuditLogPort } from "../../domain/ports/out/hr-audit-log.port.js";
import type { PositionRepositoryPort } from "../../domain/ports/out/position-repository.port.js";
import type { LocationRepositoryPort } from "../../../locations/domain/ports/out/location-repository.port.js";
import type { CreateEmployeeCommand, CreateEmployeePort, EmployeeDTO } from "../../domain/ports/in/employee.ports.js";
import { toEmployeeDTO } from "./shared.js";
import { resolveEmployeeAssignments } from "./employee-assignments.js";

export class CreateEmployeeUseCase implements CreateEmployeePort {
  constructor(
    private readonly employeeRepository: EmployeeRepositoryPort,
    private readonly auditLog: HrAuditLogPort,
    private readonly positionRepository: PositionRepositoryPort,
    private readonly locationRepository: LocationRepositoryPort,
  ) {}

  async execute(command: CreateEmployeeCommand): Promise<EmployeeDTO> {
    const {
      organizationId: _organizationId,
      actor: _actor,
      positionId,
      primaryLocationId,
      authorizedLocationIds,
      ...employeeProps
    } = command;
    const assignments = await resolveEmployeeAssignments(
      this.positionRepository,
      this.locationRepository,
      command.organizationId,
      {
        ...(positionId !== undefined && { positionId }),
        ...(primaryLocationId !== undefined && { primaryLocationId }),
        ...(authorizedLocationIds !== undefined && { authorizedLocationIds }),
      },
      null,
    );
    const employee = Employee.create({ ...employeeProps, ...assignments });

    const created = await this.employeeRepository.create(command.organizationId, employee);

    await this.auditLog.record({
      organizationId: command.organizationId,
      actor: command.actor,
      entityType: "employee",
      entityId: created.id,
      employeeId: created.id,
      action: "employee_created",
      description: `Colaborador ${created.fullName} criado`,
      after: created.toProps(),
      correlationId: randomUUID(),
    });

    return toEmployeeDTO(created, "admin", null);
  }
}
