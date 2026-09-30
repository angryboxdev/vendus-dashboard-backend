import { randomUUID } from "crypto";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { StockCountSession } from "../../domain/entities/stock-count-session.js";
import { StockCountLine } from "../../domain/entities/stock-count-line.js";
import { StockCountAttempt } from "../../domain/entities/stock-count-attempt.js";
import { StockCountComponent } from "../../domain/entities/stock-count-component.js";
import {
  OverlapOverrideReasonRequiredError,
  OverlappingSessionError,
  SessionNotCountingError,
  SessionNotInDraftError,
  SessionNotReadyError,
  StaleCountLineVersionError,
  StaleCountSessionVersionError,
  StockCountLineNotFoundError,
  StockCountSessionNotFoundError,
} from "../../domain/errors.js";
import type {
  ConfirmCountSessionResult,
  StartCountSessionLineInput,
  StartCountSessionResult,
  StockMovementWritePort,
  SubmitCountAttemptComponentInput,
  SubmitCountAttemptResult,
} from "../../domain/ports/out/stock-movement-write.port.js";
import type { TolerancePolicy } from "../../domain/services/tolerance.service.js";
import { breachesTolerance, computeFinancialImpact, computeVariance } from "../../domain/services/variance.service.js";
import type { FakeStockCountRepository } from "./fake-stock-count-repository.js";

interface FakeMovement {
  id: string;
  itemId: string;
  locationId: string;
  quantity: number;
  createdAt: Date;
  countSessionId?: string;
  countLineId?: string;
}

/**
 * Simula as 3 RPCs `plpgsql` reais mutando o MESMO `FakeStockCountRepository`
 * injetado (nunca um estado próprio e independente) — mesma lição já
 * aprendida no módulo irmão: dois fakes que não partilham estado escondem
 * bugs de sincronização reais. `movements` é o ledger interno (equivalente
 * a `stock_movements`), usado tanto para o snapshot teórico durante
 * `submitAttempt` como para os movimentos finais gravados em `confirmSession`.
 */
export class FakeStockMovementWrite implements StockMovementWritePort {
  movements: FakeMovement[] = [];
  /** Custo unitário por item — usado para simular `variance_value` como a RPC real faria via `stock_items`. */
  unitCostByItem = new Map<string, number>();

  constructor(private readonly repository: FakeStockCountRepository) {}

  addMovement(itemId: string, locationId: string, quantity: number, createdAt: Date = new Date()): void {
    this.movements.push({ id: randomUUID(), itemId, locationId, quantity, createdAt });
  }

  async startSession(
    _organizationId: OrganizationId,
    sessionId: string,
    expectedVersion: number,
    lines: StartCountSessionLineInput[],
    startedBy: string,
    overrideOverlap: boolean,
    overrideReason: string | null,
  ): Promise<StartCountSessionResult> {
    const session = this.repository.sessions.get(sessionId);
    if (!session) throw new StockCountSessionNotFoundError(sessionId);

    if (session.status === "counting") {
      const existingLines = [...this.repository.lines.values()].filter((l) => l.sessionId === sessionId);
      return { sessionId, status: session.status, version: session.version, linesMaterialized: existingLines.length };
    }
    if (session.status !== "draft") throw new SessionNotInDraftError(sessionId);
    if (session.version !== expectedVersion) throw new StaleCountSessionVersionError(session.version);

    const itemIds = new Set(lines.map((l) => l.itemId));
    if (!overrideOverlap) {
      for (const other of this.repository.sessions.values()) {
        if (other.id === sessionId) continue;
        if (other.organizationId !== session.organizationId) continue;
        if (other.locationId !== session.locationId) continue;
        if (!StockCountSession.ACTIVE_STATUSES.includes(other.status)) continue;
        const conflictingLine = [...this.repository.lines.values()].find((l) => l.sessionId === other.id && itemIds.has(l.itemId));
        if (conflictingLine) throw new OverlappingSessionError(other.id, other.sessionNumber);
      }
    } else if (!overrideReason || overrideReason.trim().length === 0) {
      throw new OverlapOverrideReasonRequiredError();
    }

    let materialized = 0;
    for (const line of lines) {
      const alreadyExists = [...this.repository.lines.values()].some((l) => l.sessionId === sessionId && l.itemId === line.itemId);
      if (alreadyExists) continue;
      const created = StockCountLine.create({
        organizationId: session.organizationId,
        sessionId,
        itemId: line.itemId,
        isUnscoped: line.isUnscoped ?? false,
      });
      this.repository.lines.set(created.id, created);
      materialized += 1;
    }

    const started = session.start(startedBy);
    this.repository.sessions.set(sessionId, started);

    return { sessionId, status: started.status, version: started.version, linesMaterialized: materialized };
  }

  async submitAttempt(
    _organizationId: OrganizationId,
    countLineId: string,
    expectedLineVersion: number,
    countedQuantity: number,
    components: SubmitCountAttemptComponentInput[],
    countedBy: string,
    countStartedAt: Date,
    toleranceSnapshot: TolerancePolicy | null,
    reason: string | null,
  ): Promise<SubmitCountAttemptResult> {
    const line = this.repository.lines.get(countLineId);
    if (!line) throw new StockCountLineNotFoundError(countLineId);
    const session = this.repository.sessions.get(line.sessionId);
    if (!session) throw new StockCountSessionNotFoundError(line.sessionId);
    if (session.status !== "counting" && session.status !== "reviewing") throw new SessionNotCountingError(session.id);
    if (line.version !== expectedLineVersion) throw new StaleCountLineVersionError(line.version);

    const relevantMovements = this.movements.filter((m) => m.itemId === line.itemId && m.locationId === session.locationId);
    const atCount = relevantMovements.filter((m) => m.createdAt.getTime() <= countStartedAt.getTime());
    const systemQuantityAtCount = atCount.reduce((sum, m) => sum + m.quantity, 0);
    const ledgerVersionAtCount = atCount.length;

    // "Agora" é modelado pela ORDEM DE CHAMADA (quantos movimentos existem no
    // ledger no momento em que esta tentativa é processada), nunca pelo
    // relógio real da máquina — os testes fixam datas de movimento
    // arbitrárias (passadas/futuras) para simular "durante"/"depois da
    // contagem" de forma determinística, tal como a RPC real faria dentro da
    // mesma transação (COUNT(*) até `now()` é, na prática, "tudo o que já
    // foi commitado antes desta chamada").
    const ledgerVersionNow = relevantMovements.length;
    const movementsDuringCount = ledgerVersionNow !== ledgerVersionAtCount;

    const attemptNumber = [...this.repository.attempts.values()].filter((a) => a.countLineId === countLineId).length + 1;
    const attempt = StockCountAttempt.create({
      organizationId: line.toProps().organizationId,
      countLineId,
      attemptNumber,
      countStartedAt,
      countedQuantity,
      systemQuantityAtCount,
      ledgerVersionAtCount,
      movementsDuringCount,
      countedBy,
      reasonNullable: reason,
    });
    this.repository.attempts.set(attempt.toProps().id, attempt);

    for (const c of components) {
      const component = StockCountComponent.create({
        organizationId: line.toProps().organizationId,
        attemptId: attempt.toProps().id,
        countAreaId: c.countAreaId,
        quantity: c.quantity,
        unit: c.unit,
        conversionFactor: c.conversionFactor,
      });
      this.repository.components.set(component.id, component);
    }

    const variance = computeVariance(countedQuantity, systemQuantityAtCount);
    const unitCost = this.unitCostByItem.get(line.itemId) ?? null;
    const financialImpact = computeFinancialImpact(variance.absolute, unitCost);
    const breach = breachesTolerance(variance, financialImpact, toleranceSnapshot);

    const updatedLine = line.recordAttemptOutcome({
      selectedAttemptId: attempt.toProps().id,
      finalCountedQuantity: countedQuantity,
      finalSystemQuantity: systemQuantityAtCount,
      finalVariance: variance.absolute,
      variancePercent: variance.percent,
      varianceValue: financialImpact,
      toleranceSnapshot,
      movementsDuringCount,
      breachesTolerance: breach,
    });
    this.repository.lines.set(countLineId, updatedLine);

    return {
      attemptId: attempt.toProps().id,
      attemptNumber,
      lineStatus: updatedLine.status,
      lineVersion: updatedLine.version,
      systemQuantityAtCount,
      ledgerVersionAtCount,
      finalVariance: variance.absolute,
      variancePercent: variance.percent,
      varianceValue: financialImpact,
      movementsDuringCount,
    };
  }

  async confirmSession(
    _organizationId: OrganizationId,
    sessionId: string,
    expectedVersion: number,
    approvedBy: string,
    businessDate: string,
  ): Promise<ConfirmCountSessionResult> {
    const session = this.repository.sessions.get(sessionId);
    if (!session) throw new StockCountSessionNotFoundError(sessionId);

    if (session.status === "completed") {
      const existingIds = this.movements.filter((m) => m.countSessionId === sessionId).map((m) => m.id);
      return { sessionId, status: session.status, version: session.version, movementIds: existingIds, alreadyCompleted: true };
    }
    if (session.version !== expectedVersion) throw new StaleCountSessionVersionError(session.version);
    if (session.status !== "ready") throw new SessionNotReadyError("a sessão não está no estado Pronta");

    const lines = [...this.repository.lines.values()].filter((l) => l.sessionId === sessionId);
    if (lines.some((l) => l.status === "not_counted" || l.status === "recount_required")) {
      throw new SessionNotReadyError("há linhas por resolver ou em recontagem");
    }

    const movementIds: string[] = [];
    for (const line of lines) {
      if (line.status !== "counted" && line.status !== "resolved") continue;
      const variance = line.toProps().finalVariance;
      if (!variance) continue;
      const alreadyApplied = this.movements.some((m) => m.countSessionId === sessionId && m.countLineId === line.id);
      if (alreadyApplied) continue;
      const movement: FakeMovement = {
        id: randomUUID(),
        itemId: line.itemId,
        locationId: session.locationId,
        quantity: variance,
        createdAt: new Date(businessDate),
        countSessionId: sessionId,
        countLineId: line.id,
      };
      this.movements.push(movement);
      movementIds.push(movement.id);
    }

    const applied = session.apply(approvedBy);
    this.repository.sessions.set(sessionId, applied);

    return { sessionId, status: applied.status, version: applied.version, movementIds, alreadyCompleted: false };
  }
}
