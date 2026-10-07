import { randomUUID } from "crypto";
import { WorkShift, type WorkShiftProps } from "../../domain/entities/work-shift.js";
import { UndoNotAvailableError } from "../../domain/errors.js";
import type { HrAuditLogPort } from "../../domain/ports/out/hr-audit-log.port.js";
import type { WorkShiftRepositoryPort } from "../../domain/ports/out/work-shift-repository.port.js";
import type { UndoDeleteWorkShiftsCommand, UndoDeleteWorkShiftsPort } from "../../domain/ports/in/schedule.ports.js";

/** Até quando, depois de apagar, o "Desfazer" ainda repõe (o aviso no ecrã dura bem menos). */
export const UNDO_WINDOW_MINUTES = 15;

function isShiftProps(v: unknown): v is WorkShiftProps {
  return !!v && typeof v === "object" && typeof (v as WorkShiftProps).id === "string" && typeof (v as WorkShiftProps).workDate === "string";
}

/**
 * "Desfazer" depois de apagar um turno ou limpar turnos: repõe os turnos
 * guardados na auditoria da própria operação (`correlationId` = código de
 * desfazer), com o mesmo id e estado. Nunca aceita turnos vindos do cliente.
 * Só quem apagou, e só dentro da janela; um turno que entretanto voltou a
 * existir é ignorado (pedir duas vezes não duplica nada).
 */
export class UndoDeleteWorkShiftsUseCase implements UndoDeleteWorkShiftsPort {
  constructor(
    private readonly workShiftRepository: WorkShiftRepositoryPort,
    private readonly auditLog: HrAuditLogPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(command: UndoDeleteWorkShiftsCommand): Promise<{ restoredCount: number }> {
    const records = (await this.auditLog.findByCorrelationId(command.organizationId, command.undoToken)).filter(
      (r) => r.entityType === "work_shift" && r.action === "deleted",
    );
    if (records.length === 0 || records.some((r) => r.actor !== command.actor)) throw new UndoNotAvailableError();
    const oldest = Math.min(...records.map((r) => Date.parse(r.createdAt)));
    if (this.now().getTime() - oldest > UNDO_WINDOW_MINUTES * 60_000) throw new UndoNotAvailableError();

    const snapshots = records.flatMap((r) => (Array.isArray(r.before) ? r.before : [r.before])).filter(isShiftProps);
    const correlationId = randomUUID();
    let restoredCount = 0;
    for (const props of snapshots) {
      if (await this.workShiftRepository.findById(command.organizationId, props.id)) continue;
      const shift = await this.workShiftRepository.create(command.organizationId, WorkShift.reconstitute(props));
      restoredCount++;
      await this.auditLog.record({
        organizationId: command.organizationId,
        actor: command.actor,
        entityType: "work_shift",
        entityId: shift.id,
        employeeId: shift.employeeId,
        action: "restored",
        description: `Turno reposto (desfazer): ${shift.workDate} ${shift.startTime}–${shift.endTime}`,
        after: shift.toProps(),
        correlationId,
      });
    }
    return { restoredCount };
  }
}
