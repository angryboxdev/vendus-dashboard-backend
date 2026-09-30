import { StockCountSessionNotFoundError } from "../../domain/errors.js";
import type { StartCountSessionCommand, StartCountSessionPort, StockCountSessionDTO } from "../../domain/ports/in/stock-count.ports.js";
import type { StockCountRepositoryPort } from "../../domain/ports/out/stock-count-repository.port.js";
import type { StockItemCatalogPort } from "../../domain/ports/out/stock-item-catalog.port.js";
import type { StockMovementWritePort } from "../../domain/ports/out/stock-movement-write.port.js";
import type { StockCountAuditLogPort } from "../../domain/ports/out/stock-count-audit-log.port.js";
import { buildSessionDTO } from "./shared.js";

/**
 * Rascunho → Em contagem: materializa o escopo em linhas via RPC
 * (idempotente, verifica sobreposição). `zoneIds` do escopo é só
 * informativo nesta ronda — não existe hoje uma tabela item↔zona, por isso
 * a materialização usa só `categoryIds`/`itemIds` (ver README).
 */
export class StartCountSessionUseCase implements StartCountSessionPort {
  constructor(
    private readonly repository: StockCountRepositoryPort,
    private readonly itemCatalog: StockItemCatalogPort,
    private readonly stockMovementWrite: StockMovementWritePort,
    private readonly auditLog: StockCountAuditLogPort,
  ) {}

  async execute(command: StartCountSessionCommand): Promise<StockCountSessionDTO> {
    const session = await this.repository.findSessionById(command.organizationId, command.sessionId);
    if (!session) throw new StockCountSessionNotFoundError(command.sessionId);
    const p = session.toProps();

    const eligibleItems = await this.itemCatalog.listEligibleForScope(command.organizationId, {
      ...(p.scopeDefinition.categoryIds !== undefined && { categoryIds: p.scopeDefinition.categoryIds }),
      ...(p.scopeDefinition.itemIds !== undefined && { itemIds: p.scopeDefinition.itemIds }),
    });

    await this.stockMovementWrite.startSession(
      command.organizationId,
      command.sessionId,
      command.expectedVersion,
      eligibleItems.map((item) => ({ itemId: item.id })),
      command.actor,
      command.overrideOverlap ?? false,
      command.overrideReason ?? null,
    );

    const updated = await this.repository.findSessionById(command.organizationId, command.sessionId);
    if (!updated) throw new StockCountSessionNotFoundError(command.sessionId);
    const lines = await this.repository.findLinesBySessionId(command.organizationId, command.sessionId);

    await this.auditLog.record({
      organizationId: command.organizationId,
      actor: command.actor,
      entityType: "stock_count_session",
      entityId: command.sessionId,
      action: "start",
      before: p,
      after: updated.toProps(),
    });

    return buildSessionDTO(this.repository, command.organizationId, updated, lines);
  }
}
