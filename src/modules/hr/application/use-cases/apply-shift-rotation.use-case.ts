import { randomUUID } from "crypto";
import { WorkShift } from "../../domain/entities/work-shift.js";
import { participantOnPatternA, participantOnPatternB } from "../../domain/entities/shift-rotation.js";
import { ShiftRotationNotFoundError } from "../../domain/errors.js";
import type { EmployeeRepositoryPort } from "../../domain/ports/out/employee-repository.port.js";
import type { WorkShiftRepositoryPort } from "../../domain/ports/out/work-shift-repository.port.js";
import type { ShiftRotationRepositoryPort } from "../../domain/ports/out/shift-rotation-repository.port.js";
import type { LeaveReadPort } from "../../domain/ports/out/leave-read.port.js";
import type { HolidayReadPort } from "../../domain/ports/out/holiday-read.port.js";
import type { HrAuditLogPort } from "../../domain/ports/out/hr-audit-log.port.js";
import type {
  ApplyShiftRotationCommand,
  ApplyShiftRotationPort,
  ApplyShiftRotationResultDTO,
} from "../../domain/ports/in/schedule.ports.js";
import { addDays, mondayOf, toWorkShiftDTO, weekDatesFrom } from "./schedule-shared.js";

const DEFAULT_WEEKS = 8;

/**
 * Materializa turnos reais para os 2 participantes de uma rotação, para
 * `weeks` semanas a partir de `fromWeekStartDate` (por omissão, a semana
 * corrente) — "Após aplicar, os turnos aparecem no calendário normal"
 * (RH-03). Cada dia, cada participante recebe um turno (padrão A ou B
 * consoante a semana), exceto quando: é feriado, o colaborador tem ausência
 * ativa nesse dia, ou já existe um turno nesse dia com `source` diferente
 * de "rotation" desta mesma rotação (turno manual/de outra rotação/de
 * escala base — tratado sempre como exceção protegida, sem opção de
 * sobrepor, ao contrário da escala base).
 */
export class ApplyShiftRotationUseCase implements ApplyShiftRotationPort {
  constructor(
    private readonly shiftRotationRepository: ShiftRotationRepositoryPort,
    private readonly workShiftRepository: WorkShiftRepositoryPort,
    private readonly employeeRepository: EmployeeRepositoryPort,
    private readonly leaveRead: LeaveReadPort,
    private readonly holidayRead: HolidayReadPort,
    private readonly auditLog: HrAuditLogPort,
  ) {}

  async execute(command: ApplyShiftRotationCommand): Promise<ApplyShiftRotationResultDTO> {
    const rotation = await this.shiftRotationRepository.findById(command.organizationId, command.rotationId);
    if (!rotation) throw new ShiftRotationNotFoundError(command.rotationId);

    const employees = await this.employeeRepository.findMany(command.organizationId, { status: "all" });
    const nameById = new Map(employees.map((e) => [e.id, e.fullName]));

    const weeks = Math.max(1, command.weeks ?? DEFAULT_WEEKS);
    const startMonday = mondayOf(command.fromWeekStartDate ?? new Date().toISOString().slice(0, 10));
    const rangeFrom = startMonday;
    const rangeTo = addDays(startMonday, weeks * 7 - 1);

    const [existingShifts, leaves, holidays] = await Promise.all([
      this.workShiftRepository.findInRange(command.organizationId, { from: rangeFrom, to: rangeTo }),
      this.leaveRead.findActiveInRange(command.organizationId, rangeFrom, rangeTo),
      this.holidayRead.findInRange(command.organizationId, rangeFrom, rangeTo),
    ]);
    const existingByEmployeeDate = new Map(existingShifts.map((s) => [`${s.employeeId}:${s.workDate}`, s]));
    const holidayDates = new Set(holidays.map((h) => h.date));
    const isOnLeave = (employeeId: string, date: string) =>
      leaves.some((l) => l.employeeId === employeeId && l.startDate <= date && l.endDate >= date);

    const created: WorkShift[] = [];
    const updated: WorkShift[] = [];
    const skippedDates: string[] = [];

    for (let w = 0; w < weeks; w++) {
      const weekStartDate = addDays(startMonday, w * 7);
      const patternAEmployeeId = participantOnPatternA(rotation, weekStartDate);
      const patternBEmployeeId = participantOnPatternB(rotation, weekStartDate);

      for (const date of weekDatesFrom(weekStartDate)) {
        for (const [employeeId, pattern] of [
          [patternAEmployeeId, rotation.patternA],
          [patternBEmployeeId, rotation.patternB],
        ] as const) {
          if (holidayDates.has(date) || isOnLeave(employeeId, date)) {
            skippedDates.push(date);
            continue;
          }

          const existing = existingByEmployeeDate.get(`${employeeId}:${date}`);
          if (!existing) {
            const shift = WorkShift.create({
              employeeId,
              workDate: date,
              startTime: pattern.startTime,
              endTime: pattern.endTime,
              secondStartTime: pattern.secondStartTime,
              secondEndTime: pattern.secondEndTime,
              locationId: rotation.locationId,
              status: "draft",
              source: "rotation",
              rotationId: rotation.id,
            });
            created.push(await this.workShiftRepository.create(command.organizationId, shift));
            continue;
          }

          if (existing.source !== "rotation" || existing.rotationId !== rotation.id) {
            skippedDates.push(date);
            continue;
          }

          const overwritten = existing.overwriteFromTemplate({
            startTime: pattern.startTime,
            endTime: pattern.endTime,
            secondStartTime: pattern.secondStartTime,
            secondEndTime: pattern.secondEndTime,
            locationId: rotation.locationId,
            breakMinutes: existing.breakMinutes,
            source: "rotation",
            rotationId: rotation.id,
          });
          updated.push(await this.workShiftRepository.update(command.organizationId, overwritten));
        }
      }
    }

    for (const employeeId of rotation.participantEmployeeIds) {
      await this.auditLog.record({
        organizationId: command.organizationId,
        actor: command.actor,
        entityType: "shift_rotation",
        entityId: rotation.id,
        employeeId,
        action: "schedule_updated",
        description: `Rotação aplicada a partir de ${startMonday} (${weeks} semana(s)): ${created.length} turno(s) criado(s), ${updated.length} atualizado(s)`,
        correlationId: randomUUID(),
      });
    }

    return {
      created: created.map((s) => toWorkShiftDTO(s, nameById.get(s.employeeId) ?? s.employeeId, null)),
      updated: updated.map((s) => toWorkShiftDTO(s, nameById.get(s.employeeId) ?? s.employeeId, null)),
      skippedDates,
    };
  }
}
