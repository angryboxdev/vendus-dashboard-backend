import { randomUUID } from "crypto";
import { DateTime } from "luxon";
import { MonthlyClosureNotFoundError, MonthlyClosureReopenReasonRequiredError } from "../../domain/errors.js";
import type { MonthlyClosureRepositoryPort } from "../../domain/ports/out/monthly-closure-repository.port.js";
import type { HrAuditLogPort } from "../../domain/ports/out/hr-audit-log.port.js";
import type {
  ReopenMonthlyPeriodCommand,
  ReopenMonthlyPeriodPort,
  MonthlyClosureStatusDTO,
} from "../../domain/ports/in/attendance-conference.ports.js";
import { GetMonthlyClosureStatusUseCase } from "./get-monthly-closure-status.use-case.js";

/** "Reabrir período" (secção 23) — exige motivo explícito; só para quem tem `requireMinRole("admin")` (o adapter de entrada é quem aplica isso). */
export class ReopenMonthlyPeriodUseCase implements ReopenMonthlyPeriodPort {
  constructor(
    private readonly monthlyClosureRepository: MonthlyClosureRepositoryPort,
    private readonly auditLog: HrAuditLogPort,
    private readonly getMonthlyClosureStatus: GetMonthlyClosureStatusUseCase,
  ) {}

  async execute(command: ReopenMonthlyPeriodCommand): Promise<MonthlyClosureStatusDTO> {
    if (!command.reason?.trim()) throw new MonthlyClosureReopenReasonRequiredError();

    const existing = await this.monthlyClosureRepository.findByPeriod(command.organizationId, command.year, command.month);
    if (!existing || !existing.isClosed) throw new MonthlyClosureNotFoundError(command.year, command.month);

    const now = DateTime.now().toISO()!;
    const reopened = existing.reopen(command.actor, command.reason, now);
    await this.monthlyClosureRepository.save(command.organizationId, reopened);

    await this.auditLog.record({
      organizationId: command.organizationId,
      actor: command.actor,
      entityType: "monthly_closure",
      entityId: `${command.year}-${String(command.month).padStart(2, "0")}`,
      employeeId: "",
      action: "reopened",
      description: `Período ${String(command.month).padStart(2, "0")}/${command.year} reaberto — ${command.reason}`,
      before: { status: "closed" },
      after: { status: "open" },
      correlationId: randomUUID(),
    });

    return this.getMonthlyClosureStatus.execute({ organizationId: command.organizationId, year: command.year, month: command.month });
  }
}
