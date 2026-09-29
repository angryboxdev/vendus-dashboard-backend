import { randomUUID } from "crypto";
import { ShiftRotation } from "../../domain/entities/shift-rotation.js";
import { InvalidShiftRotationError, EmployeeNotFoundError } from "../../domain/errors.js";
import type { EmployeeRepositoryPort } from "../../domain/ports/out/employee-repository.port.js";
import type { ShiftRotationRepositoryPort } from "../../domain/ports/out/shift-rotation-repository.port.js";
import type { HrAuditLogPort } from "../../domain/ports/out/hr-audit-log.port.js";
import type {
  CreateShiftRotationCommand,
  CreateShiftRotationPort,
  ShiftRotationDTO,
} from "../../domain/ports/in/schedule.ports.js";
import { mondayOf, toShiftRotationDTO } from "./schedule-shared.js";

export class CreateShiftRotationUseCase implements CreateShiftRotationPort {
  constructor(
    private readonly shiftRotationRepository: ShiftRotationRepositoryPort,
    private readonly employeeRepository: EmployeeRepositoryPort,
    private readonly auditLog: HrAuditLogPort,
  ) {}

  async execute(command: CreateShiftRotationCommand): Promise<ShiftRotationDTO> {
    if (mondayOf(command.anchorDate) !== command.anchorDate) {
      throw new InvalidShiftRotationError("A data de início tem de ser uma segunda-feira");
    }

    const nameById = new Map<string, string>();
    for (const employeeId of command.participantEmployeeIds) {
      const employee = await this.employeeRepository.findById(command.organizationId, employeeId);
      if (!employee) throw new EmployeeNotFoundError(employeeId);
      if (employee.jobRole !== command.jobRole) {
        throw new InvalidShiftRotationError(
          `${employee.fullName} não tem o cargo "${command.jobRole}" — a rotação exige a mesma função para os dois colaboradores`,
        );
      }
      nameById.set(employeeId, employee.fullName);
    }

    const rotation = ShiftRotation.create({
      jobRole: command.jobRole,
      participantEmployeeIds: command.participantEmployeeIds,
      patternA: command.patternA,
      patternB: command.patternB,
      locationId: command.locationId,
      anchorDate: command.anchorDate,
      ...(command.autoSwitchWeekly !== undefined && { autoSwitchWeekly: command.autoSwitchWeekly }),
      createdBy: command.actor,
    });
    const saved = await this.shiftRotationRepository.create(command.organizationId, rotation);

    for (const employeeId of command.participantEmployeeIds) {
      await this.auditLog.record({
        organizationId: command.organizationId,
        actor: command.actor,
        entityType: "shift_rotation",
        entityId: saved.id,
        employeeId,
        action: "created",
        description: `Rotação semanal criada para a função "${saved.jobRole}" (${nameById.get(command.participantEmployeeIds[0])} / ${nameById.get(command.participantEmployeeIds[1])})`,
        after: saved.toProps(),
        correlationId: randomUUID(),
      });
    }

    return toShiftRotationDTO(saved, nameById);
  }
}
