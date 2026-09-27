import { randomUUID } from "crypto";
import { WorkShiftNotFoundError, WorkShiftHasAttendanceError } from "../../domain/errors.js";
import type { WorkShiftRepositoryPort } from "../../domain/ports/out/work-shift-repository.port.js";
import type { HrAuditLogPort } from "../../domain/ports/out/hr-audit-log.port.js";
import type { DeleteWorkShiftCommand, DeleteWorkShiftPort } from "../../domain/ports/in/schedule.ports.js";

/** Nunca apaga um turno com presença já registada — forçaria a perder essa evidência por cascata (ver `WorkShiftHasAttendanceError`). */
export class DeleteWorkShiftUseCase implements DeleteWorkShiftPort {
  constructor(
    private readonly workShiftRepository: WorkShiftRepositoryPort,
    private readonly auditLog: HrAuditLogPort,
  ) {}

  async execute(command: DeleteWorkShiftCommand): Promise<void> {
    const existing = await this.workShiftRepository.findById(command.organizationId, command.id);
    if (!existing) throw new WorkShiftNotFoundError(command.id);

    const hasAttendance = await this.workShiftRepository.hasAttendance(command.organizationId, command.id);
    if (hasAttendance) throw new WorkShiftHasAttendanceError(command.id);

    await this.workShiftRepository.delete(command.organizationId, command.id);

    await this.auditLog.record({
      organizationId: command.organizationId,
      actor: command.actor,
      entityType: "work_shift",
      entityId: command.id,
      employeeId: existing.employeeId,
      action: "deleted",
      description: `Turno apagado: ${existing.workDate} ${existing.startTime}–${existing.endTime}`,
      before: existing.toProps(),
      correlationId: randomUUID(),
    });
  }
}
