import { randomUUID } from "crypto";
import { WorkShift } from "../../domain/entities/work-shift.js";
import { EmployeeNotFoundError, ShiftOverlapError } from "../../domain/errors.js";
import { occurrenceOverlapsShift } from "../../domain/services/shift-recurrence.service.js";
import type { EmployeeRepositoryPort } from "../../domain/ports/out/employee-repository.port.js";
import type { WorkShiftRepositoryPort } from "../../domain/ports/out/work-shift-repository.port.js";
import type { HrAuditLogPort } from "../../domain/ports/out/hr-audit-log.port.js";
import type { CreateWorkShiftCommand, CreateWorkShiftPort, WorkShiftDTO } from "../../domain/ports/in/schedule.ports.js";
import { addDays, toWorkShiftDTO, weekdayOf } from "./schedule-shared.js";

export class CreateWorkShiftUseCase implements CreateWorkShiftPort {
  constructor(
    private readonly workShiftRepository: WorkShiftRepositoryPort,
    private readonly employeeRepository: EmployeeRepositoryPort,
    private readonly auditLog: HrAuditLogPort,
  ) {}

  async execute(command: CreateWorkShiftCommand): Promise<WorkShiftDTO[]> {
    const employee = await this.employeeRepository.findById(command.organizationId, command.employeeId);
    if (!employee) throw new EmployeeNotFoundError(command.employeeId);

    const repeatWeeks = Math.max(0, command.repeatWeeks ?? 0);
    const dates = Array.from({ length: repeatWeeks + 1 }, (_, i) => addDays(command.workDate, i * 7));

    const segments = [
      { startTime: command.startTime, endTime: command.endTime },
      ...(command.secondStartTime && command.secondEndTime
        ? [{ startTime: command.secondStartTime, endTime: command.secondEndTime }]
        : []),
    ];
    const endsNextDay = command.endsNextDay ?? false;

    const created: WorkShift[] = [];
    for (const workDate of dates) {
      const nearbyDays = await this.workShiftRepository.findInRange(command.organizationId, {
        from: addDays(workDate, -1),
        to: addDays(workDate, 1),
        employeeId: command.employeeId,
      });
      const occurrence = { workDate, weekday: weekdayOf(workDate), segments, endsNextDay };
      const overlaps = nearbyDays.some((s) => occurrenceOverlapsShift(occurrence, s));
      if (overlaps) throw new ShiftOverlapError(command.employeeId, workDate);

      const shift = WorkShift.create({
        employeeId: command.employeeId,
        workDate,
        startTime: command.startTime,
        endTime: command.endTime,
        endsNextDay,
        secondStartTime: command.secondStartTime ?? null,
        secondEndTime: command.secondEndTime ?? null,
        locationId: command.locationId,
        breakMinutes: command.breakMinutes ?? 0,
        notes: command.notes ?? null,
        status: command.publish ? "published" : "draft",
      });
      const saved = await this.workShiftRepository.create(command.organizationId, shift);
      created.push(saved);

      await this.auditLog.record({
        organizationId: command.organizationId,
        actor: command.actor,
        entityType: "work_shift",
        entityId: saved.id,
        employeeId: command.employeeId,
        action: "created",
        description: `Turno criado: ${workDate} ${command.startTime}–${command.endTime}`,
        after: saved.toProps(),
        correlationId: randomUUID(),
      });
    }

    return created.map((shift) => toWorkShiftDTO(shift, employee.fullName, null));
  }
}
