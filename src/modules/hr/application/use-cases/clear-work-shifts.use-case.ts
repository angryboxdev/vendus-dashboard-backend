import { randomUUID } from "crypto";
import type { WorkShift } from "../../domain/entities/work-shift.js";
import type { WorkShiftRepositoryPort } from "../../domain/ports/out/work-shift-repository.port.js";
import type { HrAuditLogPort } from "../../domain/ports/out/hr-audit-log.port.js";
import type { ClearWorkShiftsCommand, ClearWorkShiftsPort, ClearWorkShiftsResultDTO } from "../../domain/ports/in/schedule.ports.js";
import { addDays } from "./schedule-shared.js";

/**
 * "Limpar turnos" (task, secção 12) — âmbito explícito (dia/dias/semana/
 * semanas/série), nunca um "limpar tudo" implícito. Nunca apaga um turno
 * com presença já registada (mesma regra de `DeleteWorkShiftUseCase`) — em
 * vez de abortar a operação toda, salta esse turno e reporta-o em
 * `skipped`, para as restantes datas do pedido serem sempre processadas.
 */
export class ClearWorkShiftsUseCase implements ClearWorkShiftsPort {
  constructor(
    private readonly workShiftRepository: WorkShiftRepositoryPort,
    private readonly auditLog: HrAuditLogPort,
  ) {}

  async execute(command: ClearWorkShiftsCommand): Promise<ClearWorkShiftsResultDTO> {
    const shifts = await this.resolveTargets(command);

    let deletedCount = 0;
    const skipped: ClearWorkShiftsResultDTO["skipped"] = [];
    const deletedByEmployee = new Map<string, number>();

    for (const shift of shifts) {
      const hasAttendance = await this.workShiftRepository.hasAttendance(command.organizationId, shift.id);
      if (hasAttendance) {
        skipped.push({ id: shift.id, workDate: shift.workDate, reason: "has_attendance" });
        continue;
      }
      await this.workShiftRepository.delete(command.organizationId, shift.id);
      deletedCount++;
      deletedByEmployee.set(shift.employeeId, (deletedByEmployee.get(shift.employeeId) ?? 0) + 1);
    }

    if (command.scope.kind === "week_all") {
      // Vários colaboradores podem estar envolvidos — 1 registo de auditoria por colaborador afetado (mesmo padrão de `ApplyShiftRotationUseCase`), nunca um registo ambíguo "do primeiro turno encontrado".
      for (const [employeeId, count] of deletedByEmployee) {
        await this.auditLog.record({
          organizationId: command.organizationId,
          actor: command.actor,
          entityType: "work_shift",
          entityId: `week:${command.scope.weekStartDate}`,
          employeeId,
          action: "deleted",
          description: `Semana limpa (todos os colaboradores) a partir de ${command.scope.weekStartDate}: ${count} turno(s) apagado(s)`,
          correlationId: randomUUID(),
        });
      }
    } else if (deletedCount > 0) {
      const employeeId = shifts[0]?.employeeId ?? "";
      await this.auditLog.record({
        organizationId: command.organizationId,
        actor: command.actor,
        entityType: "work_shift",
        entityId: command.scope.kind === "series" ? command.scope.seriesId : employeeId,
        employeeId,
        action: "deleted",
        description: `Turnos limpos (${command.scope.kind}): ${deletedCount} apagado(s), ${skipped.length} preservado(s) por já terem presença registada`,
        correlationId: randomUUID(),
      });
    }

    return { deletedCount, skipped };
  }

  private async resolveTargets(command: ClearWorkShiftsCommand): Promise<WorkShift[]> {
    const { scope } = command;
    if (scope.kind === "series") {
      return this.workShiftRepository.findBySeriesId(command.organizationId, scope.seriesId);
    }
    if (scope.kind === "day") {
      return this.workShiftRepository.findInRange(command.organizationId, {
        from: scope.workDate,
        to: scope.workDate,
        employeeId: scope.employeeId,
      });
    }
    if (scope.kind === "days") {
      const all = await Promise.all(
        scope.workDates.map((workDate) =>
          this.workShiftRepository.findInRange(command.organizationId, { from: workDate, to: workDate, employeeId: scope.employeeId }),
        ),
      );
      return all.flat();
    }
    if (scope.kind === "week") {
      return this.workShiftRepository.findInRange(command.organizationId, {
        from: scope.weekStartDate,
        to: addDays(scope.weekStartDate, 6),
        employeeId: scope.employeeId,
      });
    }
    if (scope.kind === "weeks") {
      const all = await Promise.all(
        scope.weekStartDates.map((weekStartDate) =>
          this.workShiftRepository.findInRange(command.organizationId, {
            from: weekStartDate,
            to: addDays(weekStartDate, 6),
            employeeId: scope.employeeId,
          }),
        ),
      );
      return all.flat();
    }
    // scope.kind === "week_all" — todos os colaboradores, sem filtro de employeeId (nunca implícito: só quando pedido explicitamente sem colaborador selecionado).
    return this.workShiftRepository.findInRange(command.organizationId, {
      from: scope.weekStartDate,
      to: addDays(scope.weekStartDate, 6),
      ...(scope.locationId && { locationId: scope.locationId }),
    });
  }
}
