import { randomUUID } from "crypto";
import { WorkShift } from "../../domain/entities/work-shift.js";
import type { EmployeeRepositoryPort } from "../../domain/ports/out/employee-repository.port.js";
import type { WorkShiftRepositoryPort } from "../../domain/ports/out/work-shift-repository.port.js";
import type { LeaveReadPort } from "../../domain/ports/out/leave-read.port.js";
import type { HolidayReadPort } from "../../domain/ports/out/holiday-read.port.js";
import type { HrAuditLogPort } from "../../domain/ports/out/hr-audit-log.port.js";
import type {
  RepeatCalendarWeekCommand,
  RepeatCalendarWeekPort,
  RepeatCalendarWeekEmployeeResultDTO,
  RepeatCalendarWeekResultDTO,
} from "../../domain/ports/in/schedule.ports.js";
import { computeRepeatWeekPartitions } from "./repeat-calendar-week-shared.js";
import { toPlannedOccurrenceDTO } from "./shift-series-shared.js";
import { toWorkShiftDTO } from "./schedule-shared.js";

/**
 * "Repetir escala pelo calendário" — cria, a partir dos turnos REAIS de uma
 * semana já montada (potencialmente vários colaboradores, cada um com o seu
 * próprio horário), o mesmo padrão nas semanas seguintes. Cada (colaborador,
 * local) encontrado na origem gera a sua própria série (`seriesId` próprio)
 * — mesma semântica já usada por "Novo Turno Padrão Semanal": por omissão só
 * persiste as ocorrências disponíveis; `force: true` persiste também as em
 * conflito (nunca as de férias/ausência/feriado, essas nunca se forçam).
 */
export class RepeatCalendarWeekUseCase implements RepeatCalendarWeekPort {
  constructor(
    private readonly workShiftRepository: WorkShiftRepositoryPort,
    private readonly employeeRepository: EmployeeRepositoryPort,
    private readonly leaveRead: LeaveReadPort,
    private readonly holidayRead: HolidayReadPort,
    private readonly auditLog: HrAuditLogPort,
  ) {}

  async execute(command: RepeatCalendarWeekCommand): Promise<RepeatCalendarWeekResultDTO> {
    const employees = await this.employeeRepository.findMany(command.organizationId, { status: "all" });
    const employeeNameById = new Map(employees.map((e) => [e.id, e.fullName]));

    const groups = await computeRepeatWeekPartitions({
      organizationId: command.organizationId,
      sourceWeekStartDate: command.sourceWeekStartDate,
      weekdays: command.weekdays,
      employeeIds: command.employeeIds,
      ...(command.rotateEmployees && { rotateEmployees: true }),
      repeat: command.repeat,
      workShiftRepository: this.workShiftRepository,
      leaveRead: this.leaveRead,
      holidayRead: this.holidayRead,
    });

    const byEmployee = new Map<string, RepeatCalendarWeekEmployeeResultDTO>();
    const status = command.publish ? "published" : "draft";

    for (const group of groups) {
      const { toCreate, conflicts, skipped } = group.partition;
      const toPersist = command.force ? [...toCreate, ...conflicts] : toCreate;
      const seriesId = toPersist.length > 1 ? randomUUID() : null;

      const created = [];
      for (const occurrence of toPersist) {
        const segment = occurrence.segments[0]!;
        const shift = WorkShift.create({
          employeeId: group.employeeId,
          workDate: occurrence.workDate,
          startTime: segment.startTime,
          endTime: segment.endTime,
          endsNextDay: occurrence.endsNextDay,
          ...(occurrence.segments[1] && { secondStartTime: occurrence.segments[1].startTime, secondEndTime: occurrence.segments[1].endTime }),
          locationId: group.locationId,
          notes: command.notes ?? null,
          status,
          source: "manual",
          seriesId,
        });
        created.push(await this.workShiftRepository.create(command.organizationId, shift));
      }

      const employeeName = employeeNameById.get(group.employeeId) ?? group.employeeId;
      const createdDTOs = created.map((s) => toWorkShiftDTO(s, employeeName, null));
      const conflictDTOs = command.force ? [] : conflicts.map((o) => toPlannedOccurrenceDTO(o, "conflict"));
      const skippedDTOs = skipped.map((o) => toPlannedOccurrenceDTO(o, o.reason === "leave" ? "skipped_leave" : "skipped_holiday"));

      const existing = byEmployee.get(group.employeeId);
      if (existing) {
        existing.created.push(...createdDTOs);
        existing.conflicts.push(...conflictDTOs);
        existing.skipped.push(...skippedDTOs);
      } else {
        byEmployee.set(group.employeeId, {
          employeeId: group.employeeId,
          employeeName,
          created: createdDTOs,
          conflicts: conflictDTOs,
          skipped: skippedDTOs,
        });
      }
    }

    const employeeResults = [...byEmployee.values()];

    for (const result of employeeResults) {
      if (result.created.length === 0) continue;
      await this.auditLog.record({
        organizationId: command.organizationId,
        actor: command.actor,
        entityType: "work_shift",
        entityId: result.created[0]!.seriesId ?? result.created[0]!.id,
        employeeId: result.employeeId,
        action: "created",
        description: `Escala repetida a partir da semana de ${command.sourceWeekStartDate}: ${result.created.length} turno(s) criado(s)${
          result.conflicts.length > 0 ? `, ${result.conflicts.length} em conflito (não criados)` : ""
        }`,
        correlationId: randomUUID(),
      });
    }

    return {
      employees: employeeResults,
      totalCreated: employeeResults.reduce((sum, e) => sum + e.created.length, 0),
      totalConflicts: employeeResults.reduce((sum, e) => sum + e.conflicts.length, 0),
      totalSkipped: employeeResults.reduce((sum, e) => sum + e.skipped.length, 0),
    };
  }
}
