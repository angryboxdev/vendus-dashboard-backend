import { randomUUID } from "crypto";
import { DateTime } from "luxon";
import { MonthlyClosure } from "../../domain/entities/monthly-closure.js";
import { MonthlyClosureHasBlockersError } from "../../domain/errors.js";
import type { MonthlyClosureRepositoryPort } from "../../domain/ports/out/monthly-closure-repository.port.js";
import type { HrAuditLogPort } from "../../domain/ports/out/hr-audit-log.port.js";
import type {
  CloseMonthlyPeriodCommand,
  CloseMonthlyPeriodPort,
  MonthlyClosureStatusDTO,
} from "../../domain/ports/in/attendance-conference.ports.js";
import { GetMonthlyClosureStatusUseCase } from "./get-monthly-closure-status.use-case.js";
import type { GetMonthlyAttendanceSummaryUseCase } from "./get-monthly-attendance-summary.use-case.js";

/** "Fechar período" (secção 22) — rejeita se houver qualquer bloqueador (secção 21); nunca fecha "à força". */
export class CloseMonthlyPeriodUseCase implements CloseMonthlyPeriodPort {
  constructor(
    private readonly getMonthlyClosureStatus: GetMonthlyClosureStatusUseCase,
    private readonly monthlyClosureRepository: MonthlyClosureRepositoryPort,
    private readonly auditLog: HrAuditLogPort,
    private readonly getMonthlyAttendanceSummary: GetMonthlyAttendanceSummaryUseCase,
  ) {}

  async execute(command: CloseMonthlyPeriodCommand): Promise<MonthlyClosureStatusDTO> {
    const status = await this.getMonthlyClosureStatus.execute({
      organizationId: command.organizationId,
      year: command.year,
      month: command.month,
    });
    if (status.blockerCount > 0) throw new MonthlyClosureHasBlockersError(status.blockerCount);

    // Calculado ANTES de gravar o fecho — enquanto o período ainda está
    // "open", `GetMonthlyAttendanceSummaryUseCase` calcula ao vivo (nunca
    // serve um snapshot de si próprio).
    const snapshot = await this.getMonthlyAttendanceSummary.execute({
      organizationId: command.organizationId,
      year: command.year,
      month: command.month,
    });

    const existing = await this.monthlyClosureRepository.findByPeriod(command.organizationId, command.year, command.month);
    const base = existing ?? MonthlyClosure.openDefault(String(command.organizationId), command.year, command.month);
    const now = DateTime.now().toISO()!;
    const closed = base.close(command.actor, now, snapshot);
    await this.monthlyClosureRepository.save(command.organizationId, closed);

    await this.auditLog.record({
      organizationId: command.organizationId,
      actor: command.actor,
      entityType: "monthly_closure",
      entityId: `${command.year}-${String(command.month).padStart(2, "0")}`,
      // Evento organizacional, não de 1 colaborador específico — nunca aparece no "Histórico" de um perfil individual.
      employeeId: "",
      action: "closed",
      description: `Período ${String(command.month).padStart(2, "0")}/${command.year} fechado`,
      before: { status: base.status },
      after: { status: "closed" },
      correlationId: randomUUID(),
    });

    return this.getMonthlyClosureStatus.execute({ organizationId: command.organizationId, year: command.year, month: command.month });
  }
}
