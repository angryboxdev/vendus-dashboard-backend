import { randomUUID } from "crypto";
import { WorkShift } from "../../domain/entities/work-shift.js";
import { EmployeeNotFoundError } from "../../domain/errors.js";
import type { EmployeeRepositoryPort } from "../../domain/ports/out/employee-repository.port.js";
import type { WorkShiftRepositoryPort } from "../../domain/ports/out/work-shift-repository.port.js";
import type { BaseScheduleRepositoryPort } from "../../domain/ports/out/base-schedule-repository.port.js";
import type { LeaveReadPort } from "../../domain/ports/out/leave-read.port.js";
import type { HolidayReadPort } from "../../domain/ports/out/holiday-read.port.js";
import type { HrAuditLogPort } from "../../domain/ports/out/hr-audit-log.port.js";
import type {
  ApplyBaseScheduleCommand,
  ApplyBaseSchedulePort,
  ApplyBaseScheduleResultDTO,
} from "../../domain/ports/in/schedule.ports.js";
import { toWorkShiftDTO, weekDatesFrom, weekdayOf } from "./schedule-shared.js";

/**
 * "Aplicar esta escala à semana" (RH-03). Regras (task): preenche o
 * planeado a partir do modelo semanal, mas NUNCA sobrescreve exceções já
 * registadas sem confirmação — um turno nesse dia com `source !== "base_schedule"`
 * (criado/editado à mão, ou de uma rotação) é sempre saltado, a não ser que
 * `overrideExceptions` seja explicitamente pedido. Dias de feriado ou com
 * ausência ativa do colaborador são sempre saltados (nunca geram turno).
 * Dias marcados "Folga" na escala base também são saltados (sem turno a
 * criar); um turno já existente nesse dia não é removido automaticamente —
 * dívida conhecida, documentada no README.
 */
export class ApplyBaseScheduleUseCase implements ApplyBaseSchedulePort {
  constructor(
    private readonly baseScheduleRepository: BaseScheduleRepositoryPort,
    private readonly workShiftRepository: WorkShiftRepositoryPort,
    private readonly employeeRepository: EmployeeRepositoryPort,
    private readonly leaveRead: LeaveReadPort,
    private readonly holidayRead: HolidayReadPort,
    private readonly auditLog: HrAuditLogPort,
  ) {}

  async execute(command: ApplyBaseScheduleCommand): Promise<ApplyBaseScheduleResultDTO> {
    const employee = await this.employeeRepository.findById(command.organizationId, command.employeeId);
    if (!employee) throw new EmployeeNotFoundError(command.employeeId);

    const templates = await this.baseScheduleRepository.findByEmployee(command.organizationId, command.employeeId);
    const templateByWeekday = new Map(templates.map((t) => [t.weekday, t]));

    const weekDates = weekDatesFrom(command.weekStartDate);
    const weekEnd = weekDates[6]!;

    const [existingShifts, leaves, holidays] = await Promise.all([
      this.workShiftRepository.findInRange(command.organizationId, {
        from: command.weekStartDate,
        to: weekEnd,
        employeeId: command.employeeId,
      }),
      this.leaveRead.findActiveInRange(command.organizationId, command.weekStartDate, weekEnd),
      this.holidayRead.findInRange(command.organizationId, command.weekStartDate, weekEnd),
    ]);
    const existingByDate = new Map(existingShifts.map((s) => [s.workDate, s]));
    const holidayDates = new Set(holidays.map((h) => h.date));
    const employeeOnLeave = (date: string) =>
      leaves.some((l) => l.employeeId === command.employeeId && l.startDate <= date && l.endDate >= date);

    const created: WorkShift[] = [];
    const updated: WorkShift[] = [];
    const skippedDates: string[] = [];

    for (const date of weekDates) {
      const template = templateByWeekday.get(weekdayOf(date));
      if (!template || template.isDayOff) {
        skippedDates.push(date);
        continue;
      }
      if (holidayDates.has(date) || employeeOnLeave(date)) {
        skippedDates.push(date);
        continue;
      }

      const existing = existingByDate.get(date);
      if (!existing) {
        const shift = WorkShift.create({
          employeeId: command.employeeId,
          workDate: date,
          startTime: template.startTime!,
          endTime: template.endTime!,
          locationId: template.locationId!,
          breakMinutes: template.breakMinutes,
          status: "draft",
          source: "base_schedule",
        });
        created.push(await this.workShiftRepository.create(command.organizationId, shift));
        continue;
      }

      if (existing.source !== "base_schedule" && !command.overrideExceptions) {
        skippedDates.push(date);
        continue;
      }

      const overwritten = existing.overwriteFromTemplate({
        startTime: template.startTime!,
        endTime: template.endTime!,
        locationId: template.locationId!,
        breakMinutes: template.breakMinutes,
        source: "base_schedule",
      });
      updated.push(await this.workShiftRepository.update(command.organizationId, overwritten));
    }

    await this.auditLog.record({
      organizationId: command.organizationId,
      actor: command.actor,
      entityType: "base_schedule_template",
      entityId: `${command.employeeId}:${command.weekStartDate}`,
      employeeId: command.employeeId,
      action: "schedule_updated",
      description: `Escala base aplicada à semana de ${command.weekStartDate}: ${created.length} turno(s) criado(s), ${updated.length} atualizado(s), ${skippedDates.length} dia(s) preservado(s)`,
      correlationId: randomUUID(),
    });

    return {
      created: created.map((s) => toWorkShiftDTO(s, employee.fullName, null)),
      updated: updated.map((s) => toWorkShiftDTO(s, employee.fullName, null)),
      skippedDates,
    };
  }
}
