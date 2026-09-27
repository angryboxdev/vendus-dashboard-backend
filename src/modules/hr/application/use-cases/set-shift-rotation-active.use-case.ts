import { randomUUID } from "crypto";
import { ShiftRotationNotFoundError } from "../../domain/errors.js";
import type { EmployeeRepositoryPort } from "../../domain/ports/out/employee-repository.port.js";
import type { ShiftRotationRepositoryPort } from "../../domain/ports/out/shift-rotation-repository.port.js";
import type { HrAuditLogPort } from "../../domain/ports/out/hr-audit-log.port.js";
import type {
  SetShiftRotationActiveCommand,
  SetShiftRotationActivePort,
  ShiftRotationDTO,
} from "../../domain/ports/in/schedule.ports.js";
import { toShiftRotationDTO } from "./schedule-shared.js";

/** Pausar/retomar/desativar são o mesmo estado binário nesta fase (MVP) — ver README. Nunca apaga a rotação nem os turnos já materializados. */
export class SetShiftRotationActiveUseCase implements SetShiftRotationActivePort {
  constructor(
    private readonly shiftRotationRepository: ShiftRotationRepositoryPort,
    private readonly employeeRepository: EmployeeRepositoryPort,
    private readonly auditLog: HrAuditLogPort,
  ) {}

  async execute(command: SetShiftRotationActiveCommand): Promise<ShiftRotationDTO> {
    const existing = await this.shiftRotationRepository.findById(command.organizationId, command.rotationId);
    if (!existing) throw new ShiftRotationNotFoundError(command.rotationId);

    const saved = await this.shiftRotationRepository.update(command.organizationId, existing.setActive(command.active));

    const employees = await this.employeeRepository.findMany(command.organizationId, { status: "all" });
    const nameById = new Map(employees.map((e) => [e.id, e.fullName]));

    for (const employeeId of saved.participantEmployeeIds) {
      await this.auditLog.record({
        organizationId: command.organizationId,
        actor: command.actor,
        entityType: "shift_rotation",
        entityId: saved.id,
        employeeId,
        action: "status_changed",
        description: `Rotação ${command.active ? "reativada" : "pausada"}`,
        correlationId: randomUUID(),
      });
    }

    return toShiftRotationDTO(saved, nameById);
  }
}
