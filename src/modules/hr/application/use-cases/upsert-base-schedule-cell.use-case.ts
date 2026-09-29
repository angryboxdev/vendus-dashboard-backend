import { randomUUID } from "crypto";
import { BaseScheduleTemplate } from "../../domain/entities/base-schedule-template.js";
import type { BaseScheduleRepositoryPort } from "../../domain/ports/out/base-schedule-repository.port.js";
import type { HrAuditLogPort } from "../../domain/ports/out/hr-audit-log.port.js";
import type {
  BaseScheduleCellDTO,
  UpsertBaseScheduleCellCommand,
  UpsertBaseScheduleCellPort,
} from "../../domain/ports/in/schedule.ports.js";
import { toCellDTO } from "./get-base-schedule.use-case.js";

export class UpsertBaseScheduleCellUseCase implements UpsertBaseScheduleCellPort {
  constructor(
    private readonly baseScheduleRepository: BaseScheduleRepositoryPort,
    private readonly auditLog: HrAuditLogPort,
  ) {}

  async execute(command: UpsertBaseScheduleCellCommand): Promise<BaseScheduleCellDTO> {
    const template = command.isDayOff
      ? BaseScheduleTemplate.createDayOff(command.employeeId, command.weekday)
      : BaseScheduleTemplate.createWorkingDay({
          employeeId: command.employeeId,
          weekday: command.weekday,
          startTime: command.startTime!,
          endTime: command.endTime!,
          locationId: command.locationId!,
          breakMinutes: command.breakMinutes ?? 0,
        });

    const saved = await this.baseScheduleRepository.upsert(command.organizationId, template);

    await this.auditLog.record({
      organizationId: command.organizationId,
      actor: command.actor,
      entityType: "base_schedule_template",
      entityId: saved.id,
      employeeId: command.employeeId,
      action: "updated",
      description: saved.isDayOff
        ? `Escala base — dia ${saved.weekday} marcado como folga`
        : `Escala base — dia ${saved.weekday} definido ${saved.startTime}–${saved.endTime}`,
      after: saved.toProps(),
      correlationId: randomUUID(),
    });

    return toCellDTO(saved);
  }
}
