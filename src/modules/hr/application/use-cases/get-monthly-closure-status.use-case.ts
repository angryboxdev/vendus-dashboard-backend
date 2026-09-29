import type { ShiftAttendanceReadPort } from "../../domain/ports/out/shift-attendance-read.port.js";
import type { LeaveReadPort } from "../../domain/ports/out/leave-read.port.js";
import type { MonthlyClosureRepositoryPort } from "../../domain/ports/out/monthly-closure-repository.port.js";
import type {
  GetMonthlyClosureStatusCommand,
  GetMonthlyClosureStatusPort,
  MonthlyClosureStatusDTO,
} from "../../domain/ports/in/attendance-conference.ports.js";
import { ListAttendanceIssuesUseCase, monthRange } from "./list-attendance-issues.use-case.js";

/**
 * Contagens do rodapé "Fecho mensal" (secções 16/20/21) — reaproveita
 * `ListAttendanceIssuesUseCase`, nunca recalcula a deteção de pendências.
 * `blockerCount` = nº de ocorrências ainda `reviewStatus: "pending"`
 * (mesmo número que "Por conferir" na Conferência, garantindo a secção 21:
 * "não permitir diferenças... sem causa explícita"). Antes desta task
 * usava um subconjunto de `state` (`PARCIAL|EM_ABERTO|CONFLITO`), que
 * deixava "Possível ausência" (state `AUSENTE`) fora do bloqueio — errado
 * face à secção 16, que lista "possível ausência não classificada" como
 * bloqueador explícito. `reviewStatus === "pending"` cobre exatamente os
 * bloqueadores da secção 16 (nunca inclui férias/folga/saldo negativo/
 * dados cadastrais, que não geram ocorrência nenhuma) e deixa de bloquear
 * assim que o gestor resolve (`reviewStatus` passa a `"conferred"`),
 * mesmo quando a correção não muda o `state` do turno (ex: "Manter como
 * está"/"Justificar sem impacto").
 */
export class GetMonthlyClosureStatusUseCase implements GetMonthlyClosureStatusPort {
  constructor(
    private readonly listAttendanceIssues: ListAttendanceIssuesUseCase,
    private readonly monthlyClosureRepository: MonthlyClosureRepositoryPort,
    private readonly shiftAttendanceRead: ShiftAttendanceReadPort,
    private readonly leaveRead: LeaveReadPort,
  ) {}

  async execute(command: GetMonthlyClosureStatusCommand): Promise<MonthlyClosureStatusDTO> {
    const { from, to } = monthRange(command.year, command.month);
    const [issuesResult, closure, shifts, leaves] = await Promise.all([
      this.listAttendanceIssues.execute({ organizationId: command.organizationId, year: command.year, month: command.month }),
      this.monthlyClosureRepository.findByPeriod(command.organizationId, command.year, command.month),
      this.shiftAttendanceRead.findShiftsInRange(command.organizationId, { from, to }),
      this.leaveRead.findActiveInRange(command.organizationId, from, to),
    ]);

    const blockerCount = issuesResult.kpis.pendingCount;
    const plannedShiftsCount = shifts.filter((s) => s.attendanceStatus !== "cancelled").length;
    const issuedShiftIds = new Set(issuesResult.items.map((i) => i.shiftId).filter((id): id is string => id != null));
    const regularShiftsCount = plannedShiftsCount - issuedShiftIds.size;

    return {
      year: command.year,
      month: command.month,
      status: closure?.status ?? "open",
      closedBy: closure?.closedBy ?? null,
      closedAt: closure?.closedAt ?? null,
      reopenedBy: closure?.reopenedBy ?? null,
      reopenedAt: closure?.reopenedAt ?? null,
      reopenReason: closure?.reopenReason ?? null,
      blockerCount,
      plannedShiftsCount,
      regularShiftsCount,
      lateCount: issuesResult.kpis.lateOccurrencesCount,
      leaveDaysCount: leaves.length,
    };
  }
}
