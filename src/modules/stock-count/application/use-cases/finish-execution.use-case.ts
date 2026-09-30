import { StockCountSessionNotFoundError, StaleCountSessionVersionError } from "../../domain/errors.js";
import type { FinishExecutionCommand, FinishExecutionPort, StockCountSessionDTO } from "../../domain/ports/in/stock-count.ports.js";
import type { StockCountRepositoryPort } from "../../domain/ports/out/stock-count-repository.port.js";
import type { StockCountAuditLogPort } from "../../domain/ports/out/stock-count-audit-log.port.js";
import { buildSessionDTO } from "./shared.js";

/** Em contagem → Em revisão: valida (lendo as linhas) que todas estão `counted`/`resolved`. */
export class FinishExecutionUseCase implements FinishExecutionPort {
  constructor(
    private readonly repository: StockCountRepositoryPort,
    private readonly auditLog: StockCountAuditLogPort,
  ) {}

  async execute(command: FinishExecutionCommand): Promise<StockCountSessionDTO> {
    const session = await this.repository.findSessionById(command.organizationId, command.sessionId);
    if (!session) throw new StockCountSessionNotFoundError(command.sessionId);
    if (session.version !== command.expectedVersion) throw new StaleCountSessionVersionError(session.version);

    const lines = await this.repository.findLinesBySessionId(command.organizationId, command.sessionId);
    const pending = lines.filter((l) => l.status === "not_counted");
    const before = session.toProps();
    const updated = session.finishExecution(pending.length === 0, pending.length);
    await this.repository.saveSession(command.organizationId, updated, command.expectedVersion);

    await this.auditLog.record({
      organizationId: command.organizationId,
      actor: command.actor,
      entityType: "stock_count_session",
      entityId: command.sessionId,
      action: "finish_execution",
      before,
      after: updated.toProps(),
    });

    return buildSessionDTO(this.repository, command.organizationId, updated, lines);
  }
}
