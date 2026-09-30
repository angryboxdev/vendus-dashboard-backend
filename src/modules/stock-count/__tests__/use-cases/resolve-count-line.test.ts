import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { StockCountLine } from "../../domain/entities/stock-count-line.js";
import { StockCountAttempt } from "../../domain/entities/stock-count-attempt.js";
import { ResolveCountLineUseCase } from "../../application/use-cases/resolve-count-line.use-case.js";
import { ManualResolutionReasonRequiredError } from "../../domain/errors.js";
import { FakeStockCountRepository } from "../fakes/fake-stock-count-repository.js";
import { FakeStockItemCatalog } from "../fakes/fake-stock-item-catalog.js";
import { FakeStockCountAuditLog } from "../fakes/fake-stock-count-audit-log.js";

const ORG = mintOrganizationId("org-test");

function makeUseCase() {
  const repository = new FakeStockCountRepository();
  const itemCatalog = new FakeStockItemCatalog();
  const auditLog = new FakeStockCountAuditLog();
  const useCase = new ResolveCountLineUseCase(repository, itemCatalog, auditLog);
  return { repository, itemCatalog, auditLog, useCase };
}

describe("ResolveCountLineUseCase", () => {
  it("select_attempt: gestor escolhe explicitamente qual tentativa (de uma recontagem) vale", async () => {
    const { repository, useCase } = makeUseCase();
    const line = StockCountLine.create({ organizationId: ORG, sessionId: "session-1", itemId: "item-1" })
      .recordAttemptOutcome({
        selectedAttemptId: "a-0",
        finalCountedQuantity: 8,
        finalSystemQuantity: 10,
        finalVariance: -2,
        variancePercent: 0.2,
        varianceValue: null,
        toleranceSnapshot: null,
        movementsDuringCount: false,
        breachesTolerance: false,
      })
      .requestRecount("divergência");
    repository.seedLine(line);
    const attempt1 = StockCountAttempt.create({
      organizationId: ORG,
      countLineId: line.id,
      attemptNumber: 1,
      countStartedAt: new Date(),
      countedQuantity: 8,
      systemQuantityAtCount: 10,
      ledgerVersionAtCount: 1,
      movementsDuringCount: false,
      countedBy: "ana@fonsat.pt",
    });
    const attempt2 = StockCountAttempt.create({
      organizationId: ORG,
      countLineId: line.id,
      attemptNumber: 2,
      countStartedAt: new Date(),
      countedQuantity: 9,
      systemQuantityAtCount: 10,
      ledgerVersionAtCount: 1,
      movementsDuringCount: false,
      countedBy: "bruno@fonsat.pt",
    });
    repository.seedAttempt(attempt1);
    repository.seedAttempt(attempt2);

    const dto = await useCase.execute({
      organizationId: ORG,
      lineId: line.id,
      expectedVersion: line.version,
      resolution: "select_attempt",
      selectedAttemptId: attempt2.toProps().id,
      actor: "gerente@fonsat.pt",
    });

    expect(dto.status).toBe("resolved");
    expect(dto.finalCountedQuantity).toBe(9);
    expect(dto.finalVariance).toBe(-1);
  });

  it("manual_value: exige motivo obrigatório", async () => {
    const { repository, useCase } = makeUseCase();
    const line = StockCountLine.create({ organizationId: ORG, sessionId: "session-1", itemId: "item-1" }).recordAttemptOutcome({
      selectedAttemptId: "a-1",
      finalCountedQuantity: 8,
      finalSystemQuantity: 10,
      finalVariance: -2,
      variancePercent: 0.2,
      varianceValue: null,
      toleranceSnapshot: null,
      movementsDuringCount: false,
      breachesTolerance: true,
    });
    repository.seedLine(line);

    await expect(
      useCase.execute({
        organizationId: ORG,
        lineId: line.id,
        expectedVersion: line.version,
        resolution: "manual_value",
        manualValue: 9,
        manualReason: "",
        actor: "admin@fonsat.pt",
      }),
    ).rejects.toThrow(ManualResolutionReasonRequiredError);
  });

  it("manual_value: com motivo, cria implicitamente uma tentativa manual auditável e resolve a linha", async () => {
    const { repository, auditLog, useCase } = makeUseCase();
    const line = StockCountLine.create({ organizationId: ORG, sessionId: "session-1", itemId: "item-1" }).recordAttemptOutcome({
      selectedAttemptId: "a-1",
      finalCountedQuantity: 8,
      finalSystemQuantity: 10,
      finalVariance: -2,
      variancePercent: 0.2,
      varianceValue: null,
      toleranceSnapshot: null,
      movementsDuringCount: false,
      breachesTolerance: true,
    });
    repository.seedLine(line);
    repository.seedAttempt(
      StockCountAttempt.reconstitute({
        id: "a-1",
        organizationId: ORG,
        countLineId: line.id,
        attemptNumber: 1,
        countStartedAt: new Date(),
        countedAt: new Date(),
        countedQuantity: 8,
        systemQuantityAtCount: 10,
        ledgerVersionAtCount: 1,
        movementsDuringCount: false,
        countedBy: "ana@fonsat.pt",
        isManual: false,
        reasonNullable: null,
        createdAt: new Date(),
      }),
    );

    const dto = await useCase.execute({
      organizationId: ORG,
      lineId: line.id,
      expectedVersion: line.version,
      resolution: "manual_value",
      manualValue: 9,
      manualReason: "Confirmado com o gerente após dupla verificação física",
      actor: "admin@fonsat.pt",
    });

    expect(dto.status).toBe("resolved");
    expect(dto.finalCountedQuantity).toBe(9);
    expect(dto.attempts.some((a) => a.isManual)).toBe(true);
    expect(auditLog.entries.some((e) => e.action === "resolve_manual")).toBe(true);

    // Nunca edita/apaga a tentativa automática anterior.
    expect(dto.attempts).toHaveLength(2);
  });
});
