import { randomUUID } from "crypto";
import { WorkShift } from "../../domain/entities/work-shift.js";
import { WorkShiftNotFoundError, ShiftOverlapError, EmployeeNotFoundError } from "../../domain/errors.js";
import type { EmployeeRepositoryPort } from "../../domain/ports/out/employee-repository.port.js";
import type { WorkShiftRepositoryPort } from "../../domain/ports/out/work-shift-repository.port.js";
import type { HrAuditLogPort } from "../../domain/ports/out/hr-audit-log.port.js";
import type {
  DuplicateWorkShiftCommand,
  DuplicateWorkShiftPort,
  WorkShiftDTO,
} from "../../domain/ports/in/schedule.ports.js";
import { toWorkShiftDTO } from "./schedule-shared.js";

/** Duplica sempre como rascunho (`status: "draft"`) — precisa de rever/publicar antes de ficar visível, mesmo que o original já estivesse publicado. */
export class DuplicateWorkShiftUseCase implements DuplicateWorkShiftPort {
  constructor(
    private readonly workShiftRepository: WorkShiftRepositoryPort,
    private readonly employeeRepository: EmployeeRepositoryPort,
    private readonly auditLog: HrAuditLogPort,
  ) {}

  async execute(command: DuplicateWorkShiftCommand): Promise<WorkShiftDTO> {
    const original = await this.workShiftRepository.findById(command.organizationId, command.id);
    if (!original) throw new WorkShiftNotFoundError(command.id);

    const sameDay = await this.workShiftRepository.findInRange(command.organizationId, {
      from: command.targetDate,
      to: command.targetDate,
      employeeId: original.employeeId,
    });
    const overlaps = sameDay.some(
      (s) => original.startTime < s.endTime && s.startTime < original.endTime,
    );
    if (overlaps) throw new ShiftOverlapError(original.employeeId, command.targetDate);

    const duplicate = WorkShift.create({
      employeeId: original.employeeId,
      workDate: command.targetDate,
      startTime: original.startTime,
      endTime: original.endTime,
      locationId: original.locationId,
      breakMinutes: original.breakMinutes,
      notes: original.notes,
      status: "draft",
      source: "manual",
    });
    const saved = await this.workShiftRepository.create(command.organizationId, duplicate);

    const employee = await this.employeeRepository.findById(command.organizationId, saved.employeeId);
    if (!employee) throw new EmployeeNotFoundError(saved.employeeId);

    await this.auditLog.record({
      organizationId: command.organizationId,
      actor: command.actor,
      entityType: "work_shift",
      entityId: saved.id,
      employeeId: saved.employeeId,
      action: "created",
      description: `Turno duplicado de ${original.workDate} para ${command.targetDate}`,
      after: saved.toProps(),
      correlationId: randomUUID(),
    });

    return toWorkShiftDTO(saved, employee.fullName, null);
  }
}
