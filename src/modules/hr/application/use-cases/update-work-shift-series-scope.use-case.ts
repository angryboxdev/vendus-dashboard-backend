import { randomUUID } from "crypto";
import { WorkShiftNotFoundError, WorkShiftNotInSeriesError, EmployeeNotFoundError } from "../../domain/errors.js";
import type { EmployeeRepositoryPort } from "../../domain/ports/out/employee-repository.port.js";
import type { WorkShiftRepositoryPort } from "../../domain/ports/out/work-shift-repository.port.js";
import type { HrAuditLogPort } from "../../domain/ports/out/hr-audit-log.port.js";
import type {
  UpdateWorkShiftSeriesScopeCommand,
  UpdateWorkShiftSeriesScopePort,
  WorkShiftDTO,
} from "../../domain/ports/in/schedule.ports.js";
import { toWorkShiftDTO } from "./schedule-shared.js";

/**
 * Edição de um turno pertencente a uma série (task, secção 10):
 * - `only_this`: destaca este turno da série (`applyManualEdit` já limpa
 *   `seriesId` e marca `source="manual"`) — uma exceção individual nunca
 *   volta a ser tocada por uma edição futura "toda a série"/"este e os
 *   seguintes", nem por reaplicação de escala base/rotação.
 * - `this_and_following`/`whole_series`: aplica a mesma alteração a todos
 *   os turnos da série (ou só aos de data >= este), preservando `seriesId`
 *   e `source` — só ocorrências ainda "seguindo o padrão" são tocadas.
 */
export class UpdateWorkShiftSeriesScopeUseCase implements UpdateWorkShiftSeriesScopePort {
  constructor(
    private readonly workShiftRepository: WorkShiftRepositoryPort,
    private readonly employeeRepository: EmployeeRepositoryPort,
    private readonly auditLog: HrAuditLogPort,
  ) {}

  async execute(command: UpdateWorkShiftSeriesScopeCommand): Promise<WorkShiftDTO[]> {
    const target = await this.workShiftRepository.findById(command.organizationId, command.id);
    if (!target) throw new WorkShiftNotFoundError(command.id);

    const employee = await this.employeeRepository.findById(command.organizationId, target.employeeId);
    if (!employee) throw new EmployeeNotFoundError(target.employeeId);

    const patch = {
      ...(command.startTime !== undefined && { startTime: command.startTime }),
      ...(command.endTime !== undefined && { endTime: command.endTime }),
      ...(command.endsNextDay !== undefined && { endsNextDay: command.endsNextDay }),
      ...(command.secondStartTime !== undefined && { secondStartTime: command.secondStartTime }),
      ...(command.secondEndTime !== undefined && { secondEndTime: command.secondEndTime }),
      ...(command.locationId !== undefined && { locationId: command.locationId }),
      ...(command.notes !== undefined && { notes: command.notes }),
    };

    if (command.scope === "only_this") {
      const updated = target.applyManualEdit(patch);
      const saved = await this.workShiftRepository.update(command.organizationId, updated);
      await this.recordAudit(command, saved.id, employee.id, "Turno destacado da série e editado individualmente");
      return [toWorkShiftDTO(saved, employee.fullName, null)];
    }

    if (!target.seriesId) throw new WorkShiftNotInSeriesError(target.id);

    const seriesShifts = await this.workShiftRepository.findBySeriesId(command.organizationId, target.seriesId);
    const affected = seriesShifts.filter((s) => command.scope === "whole_series" || s.workDate >= target.workDate);

    const saved = [];
    for (const shift of affected) {
      const updated = shift.applySeriesEdit(patch);
      saved.push(await this.workShiftRepository.update(command.organizationId, updated));
    }

    await this.recordAudit(
      command,
      target.seriesId,
      employee.id,
      `Série editada (${command.scope === "whole_series" ? "toda a série" : "este e os seguintes"}): ${saved.length} turno(s)`,
    );

    return saved.map((s) => toWorkShiftDTO(s, employee.fullName, null));
  }

  private async recordAudit(
    command: UpdateWorkShiftSeriesScopeCommand,
    entityId: string,
    employeeId: string,
    description: string,
  ): Promise<void> {
    await this.auditLog.record({
      organizationId: command.organizationId,
      actor: command.actor,
      entityType: "work_shift",
      entityId,
      employeeId,
      action: "updated",
      description,
      correlationId: randomUUID(),
    });
  }
}
