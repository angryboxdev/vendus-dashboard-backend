import { randomUUID } from "crypto";
import type { WorkShift } from "../../domain/entities/work-shift.js";
import type { WorkShiftRepositoryPort } from "../../domain/ports/out/work-shift-repository.port.js";
import type { HrAuditLogPort } from "../../domain/ports/out/hr-audit-log.port.js";
import type { ClearWorkShiftsCommand, ClearWorkShiftsPort, ClearWorkShiftsResultDTO } from "../../domain/ports/in/schedule.ports.js";
import { addDays } from "./schedule-shared.js";
import { assertValidClearRange, matchesClearRangeFilters } from "../../domain/services/clear-shifts.service.js";

/**
 * "Limpar turnos" (task, secção 12) — âmbito explícito (dia/dias/semana/
 * semanas/série), nunca um "limpar tudo" implícito. Nunca apaga um turno
 * com presença já registada (mesma regra de `DeleteWorkShiftUseCase`) — em
 * vez de abortar a operação toda, salta esse turno e reporta-o em
 * `skipped`, para as restantes datas do pedido serem sempre processadas.
 * Presenças verificadas e turnos apagados em lote (o âmbito "range" pode
 * abranger centenas de turnos).
 */
export class ClearWorkShiftsUseCase implements ClearWorkShiftsPort {
  constructor(
    private readonly workShiftRepository: WorkShiftRepositoryPort,
    private readonly auditLog: HrAuditLogPort,
  ) {}

  async execute(command: ClearWorkShiftsCommand): Promise<ClearWorkShiftsResultDTO> {
    const { deletable, protectedShifts: shiftsWithAttendance } = await partitionClearTargets(this.workShiftRepository, command);
    const shifts = [...deletable, ...shiftsWithAttendance];

    await this.workShiftRepository.deleteMany(
      command.organizationId,
      deletable.map((s) => s.id),
    );
    const deletedCount = deletable.length;
    const skipped: ClearWorkShiftsResultDTO["skipped"] = shiftsWithAttendance.map((s) => ({ id: s.id, workDate: s.workDate, reason: "has_attendance" }));
    const deletedByEmployee = new Map<string, number>();
    for (const shift of deletable) deletedByEmployee.set(shift.employeeId, (deletedByEmployee.get(shift.employeeId) ?? 0) + 1);
    // Os turnos apagados ficam na auditoria (`before`) — é daí que o "Desfazer" os repõe.
    const snapshotsOf = (employeeId: string) => deletable.filter((s) => s.employeeId === employeeId).map((s) => s.toProps());
    const correlationId = randomUUID();

    if (command.scope.kind === "range") {
      const { from, to } = command.scope;
      for (const [employeeId, count] of deletedByEmployee) {
        await this.auditLog.record({
          organizationId: command.organizationId,
          actor: command.actor,
          entityType: "work_shift",
          entityId: `range:${from}:${to}`,
          employeeId,
          action: "deleted",
          description: `Turnos apagados em massa de ${from} a ${to}: ${count} turno(s)`,
          before: snapshotsOf(employeeId),
          correlationId,
        });
      }
    } else if (command.scope.kind === "week_all") {
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
          before: snapshotsOf(employeeId),
          correlationId,
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
        before: deletable.map((s) => s.toProps()),
        correlationId,
      });
    }

    return { deletedCount, skipped, undoToken: deletedCount > 0 ? correlationId : null };
  }
}

/**
 * Turnos abrangidos pelo âmbito, separados em apagáveis e protegidos (com
 * presença registada). Partilhado com a pré-visualização — o que se mostra
 * é exatamente o que se apaga.
 */
export async function partitionClearTargets(
  workShiftRepository: WorkShiftRepositoryPort,
  command: { organizationId: ClearWorkShiftsCommand["organizationId"]; scope: ClearWorkShiftsCommand["scope"] },
): Promise<{ deletable: WorkShift[]; protectedShifts: WorkShift[] }> {
  const shifts = await resolveTargets(workShiftRepository, command);
  const attendance = await workShiftRepository.findAttendanceStatusesByShiftIds(
    command.organizationId,
    shifts.map((s) => s.id),
  );
  return {
    deletable: shifts.filter((s) => !attendance.has(s.id)),
    protectedShifts: shifts.filter((s) => attendance.has(s.id)),
  };
}

async function resolveTargets(
  workShiftRepository: WorkShiftRepositoryPort,
  command: { organizationId: ClearWorkShiftsCommand["organizationId"]; scope: ClearWorkShiftsCommand["scope"] },
): Promise<WorkShift[]> {
  const { scope } = command;
  if (scope.kind === "range") {
    assertValidClearRange(scope);
    const [onlyEmployee] = scope.employeeIds?.length === 1 ? scope.employeeIds : [];
    const inRange = await workShiftRepository.findInRange(command.organizationId, {
      from: scope.from,
      to: scope.to,
      ...(onlyEmployee && { employeeId: onlyEmployee }),
      ...(scope.locationId && { locationId: scope.locationId }),
    });
    return inRange.filter((s) => matchesClearRangeFilters(s, scope));
  }
  if (scope.kind === "series") {
    return workShiftRepository.findBySeriesId(command.organizationId, scope.seriesId);
  }
  if (scope.kind === "day") {
    return workShiftRepository.findInRange(command.organizationId, {
      from: scope.workDate,
      to: scope.workDate,
      employeeId: scope.employeeId,
    });
  }
  if (scope.kind === "days") {
    const all = await Promise.all(
      scope.workDates.map((workDate) =>
        workShiftRepository.findInRange(command.organizationId, { from: workDate, to: workDate, employeeId: scope.employeeId }),
      ),
    );
    return all.flat();
  }
  if (scope.kind === "week") {
    return workShiftRepository.findInRange(command.organizationId, {
      from: scope.weekStartDate,
      to: addDays(scope.weekStartDate, 6),
      employeeId: scope.employeeId,
    });
  }
  if (scope.kind === "weeks") {
    const all = await Promise.all(
      scope.weekStartDates.map((weekStartDate) =>
        workShiftRepository.findInRange(command.organizationId, {
          from: weekStartDate,
          to: addDays(weekStartDate, 6),
          employeeId: scope.employeeId,
        }),
      ),
    );
    return all.flat();
  }
  // scope.kind === "week_all" — todos os colaboradores, sem filtro de employeeId (nunca implícito: só quando pedido explicitamente sem colaborador selecionado).
  return workShiftRepository.findInRange(command.organizationId, {
    from: scope.weekStartDate,
    to: addDays(scope.weekStartDate, 6),
    ...(scope.locationId && { locationId: scope.locationId }),
  });
}
