import { randomUUID } from "crypto";
import type { WorkShift } from "../../domain/entities/work-shift.js";
import type { EmployeeRepositoryPort } from "../../domain/ports/out/employee-repository.port.js";
import type { WorkShiftRepositoryPort } from "../../domain/ports/out/work-shift-repository.port.js";
import type { HrAuditLogPort } from "../../domain/ports/out/hr-audit-log.port.js";
import type { PublishWorkShiftsCommand, PublishWorkShiftsPort, WorkShiftDTO } from "../../domain/ports/in/schedule.ports.js";
import { toWorkShiftDTO } from "./schedule-shared.js";

/** Publicação em lote — ids inexistentes ou já publicados são ignorados silenciosamente (idempotente). */
export class PublishWorkShiftsUseCase implements PublishWorkShiftsPort {
  constructor(
    private readonly workShiftRepository: WorkShiftRepositoryPort,
    private readonly employeeRepository: EmployeeRepositoryPort,
    private readonly auditLog: HrAuditLogPort,
  ) {}

  async execute(command: PublishWorkShiftsCommand): Promise<WorkShiftDTO[]> {
    const published: WorkShift[] = [];
    for (const id of command.ids) {
      const existing = await this.workShiftRepository.findById(command.organizationId, id);
      if (!existing || existing.status === "published") continue;

      const saved = await this.workShiftRepository.update(command.organizationId, existing.publish());
      published.push(saved);

      await this.auditLog.record({
        organizationId: command.organizationId,
        actor: command.actor,
        entityType: "work_shift",
        entityId: saved.id,
        employeeId: saved.employeeId,
        action: "updated",
        description: `Turno publicado: ${saved.workDate} ${saved.startTime}–${saved.endTime}`,
        before: existing.toProps(),
        after: saved.toProps(),
        correlationId: randomUUID(),
      });
    }

    const employees = await this.employeeRepository.findMany(command.organizationId, { status: "all" });
    const nameById = new Map(employees.map((e) => [e.id, e.fullName]));
    return published.map((shift) => toWorkShiftDTO(shift, nameById.get(shift.employeeId) ?? shift.employeeId, null));
  }
}
