import { StockCountSessionNotFoundError } from "../../domain/errors.js";
import type { CancelCountSessionCommand, CancelCountSessionPort, StockCountSessionDTO } from "../../domain/ports/in/stock-count.ports.js";
import type { StockCountRepositoryPort } from "../../domain/ports/out/stock-count-repository.port.js";
import type { StockCountAuditLogPort } from "../../domain/ports/out/stock-count-audit-log.port.js";
import { buildSessionDTO } from "./shared.js";

/** Nunca hard delete — cancel(reason) só antes de `completed`, sempre com motivo. */
export class CancelCountSessionUseCase implements CancelCountSessionPort {
  constructor(
    private readonly repository: StockCountRepositoryPort,
    private readonly auditLog: StockCountAuditLogPort,
  ) {}

  async execute(command: CancelCountSessionCommand): Promise<StockCountSessionDTO> {
    const session = await this.repository.findSessionById(command.organizationId, command.sessionId);
    if (!session) throw new StockCountSessionNotFoundError(command.sessionId);

    const before = session.toProps();
    const cancelled = session.cancel(command.reason);
    await this.repository.saveSession(command.organizationId, cancelled, command.expectedVersion);

    await this.auditLog.record({
      organizationId: command.organizationId,
      actor: command.actor,
      entityType: "stock_count_session",
      entityId: command.sessionId,
      action: "cancel",
      before,
      after: cancelled.toProps(),
      reason: command.reason,
    });

    const lines = await this.repository.findLinesBySessionId(command.organizationId, command.sessionId);
    return buildSessionDTO(this.repository, command.organizationId, cancelled, lines);
  }
}
