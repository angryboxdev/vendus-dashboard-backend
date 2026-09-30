import { StockCountSessionNotFoundError, StaleCountSessionVersionError } from "../../domain/errors.js";
import type { MarkSessionReadyCommand, MarkSessionReadyPort, StockCountSessionDTO } from "../../domain/ports/in/stock-count.ports.js";
import type { StockCountRepositoryPort } from "../../domain/ports/out/stock-count-repository.port.js";
import type { StockCountAuditLogPort } from "../../domain/ports/out/stock-count-audit-log.port.js";
import { buildSessionDTO } from "./shared.js";

/** Em revisão → Pronta: valida que não há linha `recount_required`/`not_counted` pendente. */
export class MarkSessionReadyUseCase implements MarkSessionReadyPort {
  constructor(
    private readonly repository: StockCountRepositoryPort,
    private readonly auditLog: StockCountAuditLogPort,
  ) {}

  async execute(command: MarkSessionReadyCommand): Promise<StockCountSessionDTO> {
    const session = await this.repository.findSessionById(command.organizationId, command.sessionId);
    if (!session) throw new StockCountSessionNotFoundError(command.sessionId);
    if (session.version !== command.expectedVersion) throw new StaleCountSessionVersionError(session.version);

    const lines = await this.repository.findLinesBySessionId(command.organizationId, command.sessionId);
    const pending = lines.filter((l) => l.status === "not_counted" || l.status === "recount_required");
    const before = session.toProps();
    const updated = session.markReady(pending.length === 0, pending.length);
    await this.repository.saveSession(command.organizationId, updated, command.expectedVersion);

    await this.auditLog.record({
      organizationId: command.organizationId,
      actor: command.actor,
      entityType: "stock_count_session",
      entityId: command.sessionId,
      action: "mark_ready",
      before,
      after: updated.toProps(),
    });

    return buildSessionDTO(this.repository, command.organizationId, updated, lines);
  }
}
