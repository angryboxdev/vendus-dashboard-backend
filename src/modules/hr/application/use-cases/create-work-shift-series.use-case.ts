import { randomUUID } from "crypto";
import { WorkShift } from "../../domain/entities/work-shift.js";
import { EmployeeNotFoundError } from "../../domain/errors.js";
import type { EmployeeRepositoryPort } from "../../domain/ports/out/employee-repository.port.js";
import type { WorkShiftRepositoryPort } from "../../domain/ports/out/work-shift-repository.port.js";
import type { LeaveReadPort } from "../../domain/ports/out/leave-read.port.js";
import type { HolidayReadPort } from "../../domain/ports/out/holiday-read.port.js";
import type { HrAuditLogPort } from "../../domain/ports/out/hr-audit-log.port.js";
import type {
  CreateWorkShiftSeriesCommand,
  CreateWorkShiftSeriesPort,
  CreateWorkShiftSeriesResultDTO,
} from "../../domain/ports/in/schedule.ports.js";
import { computeSeriesPartition, toPlannedOccurrenceDTO } from "./shift-series-shared.js";
import { toWorkShiftDTO } from "./schedule-shared.js";

/**
 * Cria uma série recorrente a partir de um padrão semanal (task "Novo Turno
 * Padrão Semanal"). Reaproveita `computeSeriesPartition` — exatamente o
 * mesmo cálculo do preview — para nunca gravar um turno em conflito
 * silenciosamente: por omissão só cria os disponíveis; `force: true` cria
 * também os que estavam em conflito de sobreposição (nunca os que caem em
 * férias/ausência/feriado — isso nunca se força). Um único turno criado
 * (ex: sem repetição, 1 só dia correspondido) fica sem `seriesId` — não faz
 * sentido "série" para 1 ocorrência.
 */
export class CreateWorkShiftSeriesUseCase implements CreateWorkShiftSeriesPort {
  constructor(
    private readonly workShiftRepository: WorkShiftRepositoryPort,
    private readonly employeeRepository: EmployeeRepositoryPort,
    private readonly leaveRead: LeaveReadPort,
    private readonly holidayRead: HolidayReadPort,
    private readonly auditLog: HrAuditLogPort,
  ) {}

  async execute(command: CreateWorkShiftSeriesCommand): Promise<CreateWorkShiftSeriesResultDTO> {
    const employee = await this.employeeRepository.findById(command.organizationId, command.employeeId);
    if (!employee) throw new EmployeeNotFoundError(command.employeeId);

    const { toCreate, conflicts, skipped } = await computeSeriesPartition({
      organizationId: command.organizationId,
      employeeId: command.employeeId,
      startDate: command.startDate,
      rules: command.rules,
      repeat: command.repeat,
      workShiftRepository: this.workShiftRepository,
      leaveRead: this.leaveRead,
      holidayRead: this.holidayRead,
    });

    const toPersist = command.force ? [...toCreate, ...conflicts] : toCreate;
    const seriesId = toPersist.length > 1 ? randomUUID() : null;
    const status = command.publish ? "published" : "draft";

    const created = [];
    for (const occurrence of toPersist) {
      const segment = occurrence.segments[0]!;
      const shift = WorkShift.create({
        employeeId: command.employeeId,
        workDate: occurrence.workDate,
        startTime: segment.startTime,
        endTime: segment.endTime,
        endsNextDay: occurrence.endsNextDay,
        ...(occurrence.segments[1] && {
          secondStartTime: occurrence.segments[1].startTime,
          secondEndTime: occurrence.segments[1].endTime,
        }),
        locationId: command.locationId,
        notes: command.notes ?? null,
        status,
        source: "manual",
        seriesId,
      });
      created.push(await this.workShiftRepository.create(command.organizationId, shift));
    }

    await this.auditLog.record({
      organizationId: command.organizationId,
      actor: command.actor,
      entityType: "work_shift",
      entityId: seriesId ?? created[0]?.id ?? "none",
      employeeId: command.employeeId,
      action: "created",
      description: `Padrão semanal aplicado a partir de ${command.startDate}: ${created.length} turno(s) criado(s)${
        conflicts.length > 0 && !command.force ? `, ${conflicts.length} em conflito (não criados)` : ""
      }`,
      correlationId: randomUUID(),
    });

    return {
      seriesId,
      created: created.map((s) => toWorkShiftDTO(s, employee.fullName, null)),
      conflicts: command.force ? [] : conflicts.map((o) => toPlannedOccurrenceDTO(o, "conflict")),
      skipped: skipped.map((o) => toPlannedOccurrenceDTO(o, o.reason === "leave" ? "skipped_leave" : "skipped_holiday")),
    };
  }
}
