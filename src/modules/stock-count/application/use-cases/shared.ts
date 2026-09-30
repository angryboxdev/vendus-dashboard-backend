import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { StockCountSession } from "../../domain/entities/stock-count-session.js";
import type { StockCountLine } from "../../domain/entities/stock-count-line.js";
import type { StockCountAttempt } from "../../domain/entities/stock-count-attempt.js";
import type { StockCountComponent } from "../../domain/entities/stock-count-component.js";
import type {
  StockCountAttemptDTO,
  StockCountComponentDTO,
  StockCountLineDTO,
  StockCountSessionDTO,
} from "../../domain/ports/in/stock-count.ports.js";
import type { StockCountRepositoryPort } from "../../domain/ports/out/stock-count-repository.port.js";

export function toComponentDTO(component: StockCountComponent): StockCountComponentDTO {
  const p = component.toProps();
  return {
    id: p.id,
    countAreaId: p.countAreaId,
    quantity: p.quantity,
    unit: p.unit,
    conversionFactor: p.conversionFactor,
    baseQuantity: p.baseQuantity,
  };
}

export function toAttemptDTO(attempt: StockCountAttempt, components: StockCountComponent[]): StockCountAttemptDTO {
  const p = attempt.toProps();
  return {
    id: p.id,
    attemptNumber: p.attemptNumber,
    countStartedAt: p.countStartedAt.toISOString(),
    countedAt: p.countedAt.toISOString(),
    countedQuantity: p.countedQuantity,
    systemQuantityAtCount: p.systemQuantityAtCount,
    movementsDuringCount: p.movementsDuringCount,
    countedBy: p.countedBy,
    isManual: p.isManual,
    reason: p.reasonNullable,
    components: components.map(toComponentDTO),
  };
}

export function toLineDTO(line: StockCountLine, attempts: StockCountAttemptDTO[]): StockCountLineDTO {
  const p = line.toProps();
  return {
    id: p.id,
    sessionId: p.sessionId,
    itemId: p.itemId,
    status: p.status,
    selectedAttemptId: p.selectedAttemptId,
    finalCountedQuantity: p.finalCountedQuantity,
    finalSystemQuantity: p.finalSystemQuantity,
    finalVariance: p.finalVariance,
    variancePercent: p.variancePercent,
    varianceValue: p.varianceValue,
    toleranceSnapshot: p.toleranceSnapshot,
    lockedBy: p.lockedBy,
    lockedAt: p.lockedAt ? p.lockedAt.toISOString() : null,
    isUnscoped: p.isUnscoped,
    version: p.version,
    attempts,
  };
}

/** Monta o DTO de uma linha, buscando as suas tentativas + componentes (N+1 aceitável — mesmo padrão de `stock-purchase-review`'s list use case). */
export async function buildLineDTO(repository: StockCountRepositoryPort, organizationId: OrganizationId, line: StockCountLine): Promise<StockCountLineDTO> {
  const attempts = await repository.findAttemptsByLineId(organizationId, line.id);
  const attemptDTOs = await Promise.all(
    attempts.map(async (attempt) => {
      const components = await repository.findComponentsByAttemptId(organizationId, attempt.toProps().id);
      return toAttemptDTO(attempt, components);
    }),
  );
  return toLineDTO(line, attemptDTOs);
}

export async function buildSessionDTO(
  repository: StockCountRepositoryPort,
  organizationId: OrganizationId,
  session: StockCountSession,
  lines: StockCountLine[],
): Promise<StockCountSessionDTO> {
  const lineDTOs = await Promise.all(lines.map((line) => buildLineDTO(repository, organizationId, line)));
  return toSessionDTO(session, lineDTOs);
}

export function toSessionDTO(session: StockCountSession, lines: StockCountLineDTO[]): StockCountSessionDTO {
  const p = session.toProps();
  return {
    id: p.id,
    locationId: p.locationId,
    type: p.type,
    sessionNumber: p.sessionNumber,
    status: p.status,
    scopeDefinition: p.scopeDefinition,
    blindCount: p.blindCount,
    businessDate: p.businessDate,
    startedAt: p.startedAt ? p.startedAt.toISOString() : null,
    startedBy: p.startedBy,
    reviewStartedAt: p.reviewStartedAt ? p.reviewStartedAt.toISOString() : null,
    readyAt: p.readyAt ? p.readyAt.toISOString() : null,
    approvedAt: p.approvedAt ? p.approvedAt.toISOString() : null,
    approvedBy: p.approvedBy,
    cancelledAt: p.cancelledAt ? p.cancelledAt.toISOString() : null,
    cancellationReason: p.cancellationReason,
    version: p.version,
    lines,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}
