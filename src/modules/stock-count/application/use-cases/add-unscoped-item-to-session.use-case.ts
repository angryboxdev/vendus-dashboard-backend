import { StockCountLine } from "../../domain/entities/stock-count-line.js";
import {
  ItemAlreadyInScopeError,
  SessionNotCountingError,
  StockCountSessionNotFoundError,
  StockItemNotEligibleError,
  StockItemNotFoundError,
} from "../../domain/errors.js";
import type { AddUnscopedItemToSessionCommand, AddUnscopedItemToSessionPort, StockCountLineDTO } from "../../domain/ports/in/stock-count.ports.js";
import type { StockCountRepositoryPort } from "../../domain/ports/out/stock-count-repository.port.js";
import type { StockItemCatalogPort } from "../../domain/ports/out/stock-item-catalog.port.js";
import type { StockCountAuditLogPort } from "../../domain/ports/out/stock-count-audit-log.port.js";
import { buildLineDTO } from "./shared.js";

/**
 * "Item não previsto" (secção 57) — permite adicionar um item a uma sessão
 * já iniciada (sempre auditado) e criar um item de stock novo a partir do
 * fluxo de contagem (nasce sempre a quantidade 0, nunca com um movimento
 * inicial). Sem verificação de sobreposição aqui — essa é só uma
 * preocupação do arranque da sessão (secção 52); ver README.
 */
export class AddUnscopedItemToSessionUseCase implements AddUnscopedItemToSessionPort {
  constructor(
    private readonly repository: StockCountRepositoryPort,
    private readonly itemCatalog: StockItemCatalogPort,
    private readonly auditLog: StockCountAuditLogPort,
  ) {}

  async execute(command: AddUnscopedItemToSessionCommand): Promise<StockCountLineDTO> {
    const session = await this.repository.findSessionById(command.organizationId, command.sessionId);
    if (!session) throw new StockCountSessionNotFoundError(command.sessionId);
    if (session.status !== "counting") throw new SessionNotCountingError(command.sessionId);

    let itemId: string;
    if (command.newItem) {
      const created = await this.itemCatalog.create(command.organizationId, command.newItem);
      itemId = created.id;
    } else {
      if (!command.itemId) throw new StockItemNotFoundError("(nenhum id fornecido)");
      const item = await this.itemCatalog.findById(command.organizationId, command.itemId);
      if (!item) throw new StockItemNotFoundError(command.itemId);
      if (!item.isActive || !item.stockTrackingEnabled) throw new StockItemNotEligibleError(command.itemId);
      itemId = item.id;
    }

    const existingLines = await this.repository.findLinesBySessionId(command.organizationId, command.sessionId);
    if (existingLines.some((l) => l.itemId === itemId)) throw new ItemAlreadyInScopeError(itemId);

    const line = StockCountLine.create({
      organizationId: command.organizationId,
      sessionId: command.sessionId,
      itemId,
      isUnscoped: true,
    });
    const inserted = await this.repository.insertLine(command.organizationId, line);

    await this.auditLog.record({
      organizationId: command.organizationId,
      actor: command.actor,
      entityType: "stock_count_line",
      entityId: inserted.id,
      action: "add_unscoped_item",
      after: inserted.toProps(),
    });

    return buildLineDTO(this.repository, command.organizationId, inserted);
  }
}
