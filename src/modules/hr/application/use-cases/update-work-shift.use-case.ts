import { randomUUID } from "crypto";
import { WorkShiftNotFoundError, ShiftOverlapError, EmployeeNotFoundError } from "../../domain/errors.js";
import { occurrenceOverlapsShift } from "../../domain/services/shift-recurrence.service.js";
import type { EmployeeRepositoryPort } from "../../domain/ports/out/employee-repository.port.js";
import type { WorkShiftRepositoryPort } from "../../domain/ports/out/work-shift-repository.port.js";
import type { HrAuditLogPort } from "../../domain/ports/out/hr-audit-log.port.js";
import type { UpdateWorkShiftCommand, UpdateWorkShiftPort, WorkShiftDTO } from "../../domain/ports/in/schedule.ports.js";
import { addDays, toWorkShiftDTO, weekdayOf } from "./schedule-shared.js";

/**
 * Edição interativa (drawer) — sempre passa `source` do turno para
 * "manual", protegendo-o de reaplicações futuras de escala base/rotação
 * (ver `WorkShift.applyManualEdit`). Regista antes/depois na auditoria.
 */
export class UpdateWorkShiftUseCase implements UpdateWorkShiftPort {
  constructor(
    private readonly workShiftRepository: WorkShiftRepositoryPort,
    private readonly employeeRepository: EmployeeRepositoryPort,
    private readonly auditLog: HrAuditLogPort,
  ) {}

  async execute(command: UpdateWorkShiftCommand): Promise<WorkShiftDTO> {
    const existing = await this.workShiftRepository.findById(command.organizationId, command.id);
    if (!existing) throw new WorkShiftNotFoundError(command.id);

    const targetDate = command.workDate ?? existing.workDate;
    const targetEmployeeId = existing.employeeId;

    const nearbyDays = await this.workShiftRepository.findInRange(command.organizationId, {
      from: addDays(targetDate, -1),
      to: addDays(targetDate, 1),
      employeeId: targetEmployeeId,
    });
    const startTime = command.startTime ?? existing.startTime;
    const endTime = command.endTime ?? existing.endTime;
    const endsNextDay = command.endsNextDay ?? existing.endsNextDay;
    const secondStartTime = command.secondStartTime !== undefined ? command.secondStartTime : existing.secondStartTime;
    const secondEndTime = command.secondEndTime !== undefined ? command.secondEndTime : existing.secondEndTime;
    const occurrence = {
      workDate: targetDate,
      weekday: weekdayOf(targetDate),
      endsNextDay,
      segments: [{ startTime, endTime }, ...(secondStartTime && secondEndTime ? [{ startTime: secondStartTime, endTime: secondEndTime }] : [])],
    };
    const overlaps = nearbyDays.some((s) => s.id !== existing.id && occurrenceOverlapsShift(occurrence, s));
    if (overlaps) throw new ShiftOverlapError(targetEmployeeId, targetDate);

    const before = existing.toProps();
    const updated = existing.applyManualEdit({
      ...(command.workDate !== undefined && { workDate: command.workDate }),
      ...(command.startTime !== undefined && { startTime: command.startTime }),
      ...(command.endTime !== undefined && { endTime: command.endTime }),
      ...(command.endsNextDay !== undefined && { endsNextDay: command.endsNextDay }),
      ...(command.secondStartTime !== undefined && { secondStartTime: command.secondStartTime }),
      ...(command.secondEndTime !== undefined && { secondEndTime: command.secondEndTime }),
      ...(command.locationId !== undefined && { locationId: command.locationId }),
      ...(command.breakMinutes !== undefined && { breakMinutes: command.breakMinutes }),
      ...(command.notes !== undefined && { notes: command.notes }),
    });
    const saved = await this.workShiftRepository.update(command.organizationId, updated);

    const employee = await this.employeeRepository.findById(command.organizationId, saved.employeeId);
    if (!employee) throw new EmployeeNotFoundError(saved.employeeId);

    await this.auditLog.record({
      organizationId: command.organizationId,
      actor: command.actor,
      entityType: "work_shift",
      entityId: saved.id,
      employeeId: saved.employeeId,
      action: "updated",
      description: `Turno editado: ${saved.workDate} ${saved.startTime}–${saved.endTime}`,
      before,
      after: saved.toProps(),
      correlationId: randomUUID(),
    });

    const attendanceByShiftId = await this.workShiftRepository.findAttendanceStatusesByShiftIds(command.organizationId, [
      saved.id,
    ]);
    return toWorkShiftDTO(saved, employee.fullName, attendanceByShiftId.get(saved.id) ?? null);
  }
}
