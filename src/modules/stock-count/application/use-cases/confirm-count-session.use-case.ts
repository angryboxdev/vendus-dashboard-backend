import { StockCountSessionNotFoundError } from "../../domain/errors.js";
import type { ConfirmCountSessionCommand, ConfirmCountSessionPort, StockCountSessionDTO } from "../../domain/ports/in/stock-count.ports.js";
import type { StockCountRepositoryPort } from "../../domain/ports/out/stock-count-repository.port.js";
import type { StockMovementWritePort } from "../../domain/ports/out/stock-movement-write.port.js";
import type { StockCountAuditLogPort } from "../../domain/ports/out/stock-count-audit-log.port.js";
import { buildSessionDTO } from "./shared.js";

/**
 * "Confirmar contagem e ajustar stock" — Pronta → Concluída, admin only
 * (validado pelo controller, secção 64). Idempotente: duplo-clique/retry
 * devolve o mesmo resultado (`alreadyCompleted`), nunca duplica movimentos.
 */
export class ConfirmCountSessionUseCase implements ConfirmCountSessionPort {
  constructor(
    private readonly repository: StockCountRepositoryPort,
    private readonly stockMovementWrite: StockMovementWritePort,
    private readonly auditLog: StockCountAuditLogPort,
  ) {}

  async execute(command: ConfirmCountSessionCommand): Promise<StockCountSessionDTO> {
    const session = await this.repository.findSessionById(command.organizationId, command.sessionId);
    if (!session) throw new StockCountSessionNotFoundError(command.sessionId);
    const before = session.toProps();

    const businessDate = command.businessDate ?? before.businessDate;
    const result = await this.stockMovementWrite.confirmSession(command.organizationId, command.sessionId, command.expectedVersion, command.actor, businessDate);

    const updated = await this.repository.findSessionById(command.organizationId, command.sessionId);
    if (!updated) throw new StockCountSessionNotFoundError(command.sessionId);
    const lines = await this.repository.findLinesBySessionId(command.organizationId, command.sessionId);

    if (!result.alreadyCompleted) {
      await this.auditLog.record({
        organizationId: command.organizationId,
        actor: command.actor,
        entityType: "stock_count_session",
        entityId: command.sessionId,
        action: "confirm",
        before,
        after: updated.toProps(),
      });
    }

    return buildSessionDTO(this.repository, command.organizationId, updated, lines);
  }
}
