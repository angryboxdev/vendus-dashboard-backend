import { randomUUID } from "crypto";
import { ShiftRotationNotFoundError } from "../../domain/errors.js";
import type { ShiftRotationRepositoryPort } from "../../domain/ports/out/shift-rotation-repository.port.js";
import type { HrAuditLogPort } from "../../domain/ports/out/hr-audit-log.port.js";
import type { DeleteShiftRotationCommand, DeleteShiftRotationPort } from "../../domain/ports/in/schedule.ports.js";

/**
 * Apaga uma rotação A/B (pedido do utilizador, 2026-10-06 — as rotações
 * deixam de ser usadas assim; o RH 2.0 substitui-as por Automatizações).
 * Os turnos já criados por ela **ficam** na escala: a FK
 * `hr_work_shifts.rotation_id` é `on delete set null`, por isso só perdem a
 * referência à rotação. Registado no histórico de cada participante.
 */
export class DeleteShiftRotationUseCase implements DeleteShiftRotationPort {
  constructor(
    private readonly shiftRotationRepository: ShiftRotationRepositoryPort,
    private readonly auditLog: HrAuditLogPort,
  ) {}

  async execute(command: DeleteShiftRotationCommand): Promise<void> {
    const existing = await this.shiftRotationRepository.findById(command.organizationId, command.rotationId);
    if (!existing) throw new ShiftRotationNotFoundError(command.rotationId);

    await this.shiftRotationRepository.delete(command.organizationId, command.rotationId);

    const correlationId = randomUUID();
    for (const employeeId of existing.participantEmployeeIds) {
      await this.auditLog.record({
        organizationId: command.organizationId,
        actor: command.actor,
        entityType: "shift_rotation",
        entityId: existing.id,
        employeeId,
        action: "deleted",
        description: "Rotação apagada (os turnos já criados mantêm-se na escala)",
        before: existing.toProps(),
        correlationId,
      });
    }
  }
}
