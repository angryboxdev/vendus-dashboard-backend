import { StockCountAttempt } from "../../domain/entities/stock-count-attempt.js";
import {
  AttemptDoesNotBelongToLineError,
  LineNotCountedYetError,
  ManualResolutionReasonRequiredError,
  StaleCountLineVersionError,
  StockCountAttemptNotFoundError,
  StockCountLineNotFoundError,
} from "../../domain/errors.js";
import type { ResolveCountLineCommand, ResolveCountLinePort, StockCountLineDTO } from "../../domain/ports/in/stock-count.ports.js";
import type { StockCountRepositoryPort } from "../../domain/ports/out/stock-count-repository.port.js";
import type { StockItemCatalogPort } from "../../domain/ports/out/stock-item-catalog.port.js";
import type { StockCountAuditLogPort } from "../../domain/ports/out/stock-count-audit-log.port.js";
import { computeFinancialImpact, computeVariance } from "../../domain/services/variance.service.js";
import { buildLineDTO } from "./shared.js";

/**
 * Gestor aceita uma tentativa X (`select_attempt`) ou define valor final
 * manual excecional (`manual_value`, admin only — validado pelo
 * controller, secção 36/64). `manual_value` cria implicitamente uma
 * "tentativa manual" auditável — nunca edita/apaga tentativas anteriores.
 */
export class ResolveCountLineUseCase implements ResolveCountLinePort {
  constructor(
    private readonly repository: StockCountRepositoryPort,
    private readonly itemCatalog: StockItemCatalogPort,
    private readonly auditLog: StockCountAuditLogPort,
  ) {}

  async execute(command: ResolveCountLineCommand): Promise<StockCountLineDTO> {
    const line = await this.repository.findLineById(command.organizationId, command.lineId);
    if (!line) throw new StockCountLineNotFoundError(command.lineId);
    if (line.version !== command.expectedVersion) throw new StaleCountLineVersionError(line.version);

    const before = line.toProps();
    const item = await this.itemCatalog.findById(command.organizationId, line.itemId);
    const unitCost = item?.purchaseReferenceUnitCostWithoutVat ?? null;

    let updated;
    if (command.resolution === "select_attempt") {
      if (!command.selectedAttemptId) throw new StockCountAttemptNotFoundError("(nenhum id fornecido)");
      const attempt = await this.repository.findAttemptById(command.organizationId, command.selectedAttemptId);
      if (!attempt) throw new StockCountAttemptNotFoundError(command.selectedAttemptId);
      if (attempt.countLineId !== command.lineId) throw new AttemptDoesNotBelongToLineError(command.selectedAttemptId, command.lineId);

      const ap = attempt.toProps();
      const variance = computeVariance(ap.countedQuantity, ap.systemQuantityAtCount);
      const financialImpact = computeFinancialImpact(variance.absolute, unitCost);
      updated = line.resolveBySelectingAttempt({
        selectedAttemptId: ap.id,
        finalCountedQuantity: ap.countedQuantity,
        finalSystemQuantity: ap.systemQuantityAtCount,
        finalVariance: variance.absolute,
        variancePercent: variance.percent,
        varianceValue: financialImpact,
      });
    } else {
      if (command.manualValue === undefined) throw new ManualResolutionReasonRequiredError();
      if (!command.manualReason || command.manualReason.trim().length === 0) throw new ManualResolutionReasonRequiredError();
      if (before.finalSystemQuantity === null) throw new LineNotCountedYetError(command.lineId);

      const existingAttempts = await this.repository.findAttemptsByLineId(command.organizationId, command.lineId);
      const nextAttemptNumber = existingAttempts.length + 1;
      const manualAttempt = StockCountAttempt.create({
        organizationId: command.organizationId,
        countLineId: command.lineId,
        attemptNumber: nextAttemptNumber,
        countStartedAt: new Date(),
        countedQuantity: command.manualValue,
        systemQuantityAtCount: before.finalSystemQuantity,
        ledgerVersionAtCount: 0,
        movementsDuringCount: false,
        countedBy: command.actor,
        isManual: true,
        reasonNullable: command.manualReason,
      });
      await this.repository.insertAttempt(command.organizationId, manualAttempt);

      const variance = computeVariance(command.manualValue, before.finalSystemQuantity);
      const financialImpact = computeFinancialImpact(variance.absolute, unitCost);
      updated = line.resolveManually({
        manualAttemptId: manualAttempt.toProps().id,
        value: command.manualValue,
        reason: command.manualReason,
        finalVariance: variance.absolute,
        variancePercent: variance.percent,
        varianceValue: financialImpact,
      });
    }

    await this.repository.saveLine(command.organizationId, updated, command.expectedVersion);

    await this.auditLog.record({
      organizationId: command.organizationId,
      actor: command.actor,
      entityType: "stock_count_line",
      entityId: command.lineId,
      action: command.resolution === "manual_value" ? "resolve_manual" : "resolve_select_attempt",
      before,
      after: updated.toProps(),
      reason: command.manualReason ?? null,
    });

    return buildLineDTO(this.repository, command.organizationId, updated);
  }
}
