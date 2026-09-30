import {
  StockCountLineNotFoundError,
  StockCountSessionNotFoundError,
  LineAlreadyResolvedError,
  LineLockedByAnotherUserError,
  SessionNotCountingError,
  StockItemNotFoundError,
  UnknownCountUnitError,
} from "../../domain/errors.js";
import type { SubmitCountAttemptCommand, SubmitCountAttemptPort, StockCountLineDTO } from "../../domain/ports/in/stock-count.ports.js";
import type { StockCountRepositoryPort } from "../../domain/ports/out/stock-count-repository.port.js";
import type { StockItemCatalogPort } from "../../domain/ports/out/stock-item-catalog.port.js";
import type { StockCategoryReadPort } from "../../domain/ports/out/stock-category-read.port.js";
import type { StockCountSettingsPort } from "../../domain/ports/out/stock-count-settings.port.js";
import type { StockMovementWritePort, SubmitCountAttemptComponentInput } from "../../domain/ports/out/stock-movement-write.port.js";
import type { StockCountAuditLogPort } from "../../domain/ports/out/stock-count-audit-log.port.js";
import { resolveTolerance } from "../../domain/services/tolerance.service.js";
import { toBaseQuantity } from "../../domain/services/unit-conversion.service.js";
import { buildLineDTO } from "./shared.js";

/**
 * Regista uma tentativa de contagem — resolve a tolerância aplicável (item
 * → categoria → empresa, secção 33) em TS antes de chamar a RPC (a
 * resolução da tolerância não depende do stock teórico vivo, só da
 * configuração da organização); a RPC computa `system_quantity_at_count` +
 * `ledger_version_at_count` (precisam de estado vivo da BD) e decide o
 * estado final da linha usando esse snapshot da tolerância — ver README.
 */
export class SubmitCountAttemptUseCase implements SubmitCountAttemptPort {
  constructor(
    private readonly repository: StockCountRepositoryPort,
    private readonly itemCatalog: StockItemCatalogPort,
    private readonly categoryRead: StockCategoryReadPort,
    private readonly settings: StockCountSettingsPort,
    private readonly stockMovementWrite: StockMovementWritePort,
    private readonly auditLog: StockCountAuditLogPort,
  ) {}

  async execute(command: SubmitCountAttemptCommand): Promise<StockCountLineDTO> {
    const line = await this.repository.findLineById(command.organizationId, command.lineId);
    if (!line) throw new StockCountLineNotFoundError(command.lineId);
    if (line.status === "resolved") throw new LineAlreadyResolvedError(command.lineId);
    if (line.isLockedByAnother(command.actor)) throw new LineLockedByAnotherUserError(line.lockedBy!);

    const session = await this.repository.findSessionById(command.organizationId, line.sessionId);
    if (!session) throw new StockCountSessionNotFoundError(line.sessionId);
    if (session.status !== "counting" && session.status !== "reviewing") throw new SessionNotCountingError(session.id);

    // Reivindica o lease (secção 51) — nunca versionado, só uma indicação de UI.
    await this.repository.saveLine(command.organizationId, line.claimLease(command.actor));

    const item = await this.itemCatalog.findById(command.organizationId, line.itemId);
    if (!item) throw new StockItemNotFoundError(line.itemId);

    const category = await this.categoryRead.findById(command.organizationId, item.categoryId);
    const companySettings = await this.settings.get(command.organizationId);
    const tolerance = resolveTolerance({
      itemTolerance: item.tolerance,
      categoryTolerance: category?.tolerance ?? null,
      companyDefaultTolerance: companySettings.defaultTolerance,
    });

    const components: SubmitCountAttemptComponentInput[] = command.components.map((c) => {
      const conversionFactor =
        c.unit === item.baseUnit ? 1 : item.alternateUnits.find((u) => u.unitLabel === c.unit)?.conversionFactorToBase;
      if (conversionFactor === undefined) throw new UnknownCountUnitError(c.unit, item.id);
      return {
        countAreaId: c.countAreaId ?? null,
        quantity: c.quantity,
        unit: c.unit,
        conversionFactor,
        baseQuantity: toBaseQuantity({ quantity: c.quantity, conversionFactor }),
      };
    });
    const countedQuantity = components.reduce((sum, c) => sum + c.baseQuantity, 0);

    await this.stockMovementWrite.submitAttempt(
      command.organizationId,
      command.lineId,
      command.expectedLineVersion,
      countedQuantity,
      components,
      command.actor,
      new Date(command.countStartedAt),
      tolerance,
      command.reason ?? null,
    );

    const updatedLine = await this.repository.findLineById(command.organizationId, command.lineId);
    if (!updatedLine) throw new StockCountLineNotFoundError(command.lineId);

    await this.auditLog.record({
      organizationId: command.organizationId,
      actor: command.actor,
      entityType: "stock_count_line",
      entityId: command.lineId,
      action: "submit_attempt",
      after: updatedLine.toProps(),
    });

    return buildLineDTO(this.repository, command.organizationId, updatedLine);
  }
}
