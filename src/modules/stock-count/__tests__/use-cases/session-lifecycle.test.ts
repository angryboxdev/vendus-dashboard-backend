import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { StockCountSession } from "../../domain/entities/stock-count-session.js";
import { StockCountLine } from "../../domain/entities/stock-count-line.js";
import { FinishExecutionUseCase } from "../../application/use-cases/finish-execution.use-case.js";
import { MarkSessionReadyUseCase } from "../../application/use-cases/mark-session-ready.use-case.js";
import { ConfirmCountSessionUseCase } from "../../application/use-cases/confirm-count-session.use-case.js";
import { CancelCountSessionUseCase } from "../../application/use-cases/cancel-count-session.use-case.js";
import { SessionAlreadyCompletedError, SessionHasPendingLinesError, CancellationReasonRequiredError } from "../../domain/errors.js";
import { FakeStockCountRepository } from "../fakes/fake-stock-count-repository.js";
import { FakeStockMovementWrite } from "../fakes/fake-stock-movement-write.js";
import { FakeStockCountAuditLog } from "../fakes/fake-stock-count-audit-log.js";

const ORG = mintOrganizationId("org-test");
const ORG_B = mintOrganizationId("org-b");

function makeCountedLine(sessionId: string, itemId: string, variance = -2) {
  return StockCountLine.create({ organizationId: ORG, sessionId, itemId }).recordAttemptOutcome({
    selectedAttemptId: "attempt-1",
    finalCountedQuantity: 8,
    finalSystemQuantity: 10,
    finalVariance: variance,
    variancePercent: 0.2,
    varianceValue: null,
    toleranceSnapshot: null,
    movementsDuringCount: false,
    breachesTolerance: false,
  });
}

function makeSession(status: "counting" | "reviewing" | "ready" = "counting", locationId = "loc-1") {
  let session = StockCountSession.create({
    organizationId: ORG,
    locationId,
    type: "general",
    scopeDefinition: {},
    blindCount: true,
    businessDate: "2026-09-30",
  }).start("manager@fonsat.pt");
  if (status === "reviewing" || status === "ready") session = session.finishExecution(true, 0);
  if (status === "ready") session = session.markReady(true, 0);
  return session;
}

describe("FinishExecutionUseCase", () => {
  it("bloqueia quando há linhas not_counted", async () => {
    const repository = new FakeStockCountRepository();
    const auditLog = new FakeStockCountAuditLog();
    const session = makeSession("counting");
    repository.seedSession(session);
    repository.seedLine(StockCountLine.create({ organizationId: ORG, sessionId: session.id, itemId: "item-1" }));
    const useCase = new FinishExecutionUseCase(repository, auditLog);

    await expect(
      useCase.execute({ organizationId: ORG, sessionId: session.id, expectedVersion: session.version, actor: "manager@fonsat.pt" }),
    ).rejects.toThrow(SessionHasPendingLinesError);
  });

  it("avança para reviewing quando todas as linhas estão contadas/resolvidas", async () => {
    const repository = new FakeStockCountRepository();
    const auditLog = new FakeStockCountAuditLog();
    const session = makeSession("counting");
    repository.seedSession(session);
    repository.seedLine(makeCountedLine(session.id, "item-1"));
    const useCase = new FinishExecutionUseCase(repository, auditLog);

    const dto = await useCase.execute({ organizationId: ORG, sessionId: session.id, expectedVersion: session.version, actor: "manager@fonsat.pt" });
    expect(dto.status).toBe("reviewing");
  });
});

describe("MarkSessionReadyUseCase", () => {
  it("bloqueia quando há linha recount_required pendente", async () => {
    const repository = new FakeStockCountRepository();
    const auditLog = new FakeStockCountAuditLog();
    const session = makeSession("reviewing");
    repository.seedSession(session);
    repository.seedLine(makeCountedLine(session.id, "item-1").requestRecount(null));
    const useCase = new MarkSessionReadyUseCase(repository, auditLog);

    await expect(
      useCase.execute({ organizationId: ORG, sessionId: session.id, expectedVersion: session.version, actor: "manager@fonsat.pt" }),
    ).rejects.toThrow(SessionHasPendingLinesError);
  });

  it("avança para ready quando não há pendências", async () => {
    const repository = new FakeStockCountRepository();
    const auditLog = new FakeStockCountAuditLog();
    const session = makeSession("reviewing");
    repository.seedSession(session);
    repository.seedLine(makeCountedLine(session.id, "item-1"));
    const useCase = new MarkSessionReadyUseCase(repository, auditLog);

    const dto = await useCase.execute({ organizationId: ORG, sessionId: session.id, expectedVersion: session.version, actor: "manager@fonsat.pt" });
    expect(dto.status).toBe("ready");
  });
});

describe("ConfirmCountSessionUseCase", () => {
  function setup() {
    const repository = new FakeStockCountRepository();
    const stockMovementWrite = new FakeStockMovementWrite(repository);
    const auditLog = new FakeStockCountAuditLog();
    const useCase = new ConfirmCountSessionUseCase(repository, stockMovementWrite, auditLog);
    return { repository, stockMovementWrite, auditLog, useCase };
  }

  it("aplica AJUSTE_CONTAGEM só para linhas com variância diferente de zero", async () => {
    const { repository, stockMovementWrite, useCase } = setup();
    const session = makeSession("ready");
    repository.seedSession(session);
    repository.seedLine(makeCountedLine(session.id, "item-with-diff", -2));
    repository.seedLine(makeCountedLine(session.id, "item-no-diff", 0));

    const dto = await useCase.execute({ organizationId: ORG, sessionId: session.id, expectedVersion: session.version, actor: "admin@fonsat.pt" });

    expect(dto.status).toBe("completed");
    const movementsForSession = stockMovementWrite.movements.filter((m) => m.countSessionId === session.id);
    expect(movementsForSession).toHaveLength(1);
    expect(movementsForSession[0]?.itemId).toBe("item-with-diff");
  });

  it("duplo-clique/retry na confirmação é idempotente — nunca duplica movimentos", async () => {
    const { repository, stockMovementWrite, useCase } = setup();
    const session = makeSession("ready");
    repository.seedSession(session);
    repository.seedLine(makeCountedLine(session.id, "item-1", -2));

    const first = await useCase.execute({ organizationId: ORG, sessionId: session.id, expectedVersion: session.version, actor: "admin@fonsat.pt" });
    const second = await useCase.execute({ organizationId: ORG, sessionId: session.id, expectedVersion: first.version, actor: "admin@fonsat.pt" });

    expect(first.status).toBe("completed");
    expect(second.status).toBe("completed");
    expect(stockMovementWrite.movements.filter((m) => m.countSessionId === session.id)).toHaveLength(1);
  });

  it("sessão concluída é imutável — qualquer mutação posterior lança SessionAlreadyCompletedError", async () => {
    const { repository, useCase } = setup();
    const session = makeSession("ready");
    repository.seedSession(session);
    repository.seedLine(makeCountedLine(session.id, "item-1", -2));
    await useCase.execute({ organizationId: ORG, sessionId: session.id, expectedVersion: session.version, actor: "admin@fonsat.pt" });

    const completed = await repository.findSessionById(ORG, session.id);
    expect(() => completed!.cancel("motivo")).toThrow(SessionAlreadyCompletedError);
    expect(() => completed!.start("outro")).toThrow();
  });
});

describe("CancelCountSessionUseCase", () => {
  it("exige motivo e nunca apaga a sessão (soft state)", async () => {
    const repository = new FakeStockCountRepository();
    const auditLog = new FakeStockCountAuditLog();
    const session = makeSession("counting");
    repository.seedSession(session);
    const useCase = new CancelCountSessionUseCase(repository, auditLog);

    await expect(
      useCase.execute({ organizationId: ORG, sessionId: session.id, expectedVersion: session.version, reason: "", actor: "manager@fonsat.pt" }),
    ).rejects.toThrow(CancellationReasonRequiredError);

    const dto = await useCase.execute({
      organizationId: ORG,
      sessionId: session.id,
      expectedVersion: session.version,
      reason: "Duplicada por engano",
      actor: "manager@fonsat.pt",
    });
    expect(dto.status).toBe("cancelled");
    expect(await repository.findSessionById(ORG, session.id)).not.toBeNull();
  });
});

describe("Isolamento multi-tenant", () => {
  it("org A nunca vê a sessão de org B", async () => {
    const repository = new FakeStockCountRepository();
    const auditLog = new FakeStockCountAuditLog();
    const sessionOrgB = StockCountSession.create({
      organizationId: ORG_B,
      locationId: "loc-1",
      type: "general",
      scopeDefinition: {},
      blindCount: true,
      businessDate: "2026-09-30",
    });
    repository.seedSession(sessionOrgB);

    // findSessionById/findSessionsAll são filtrados por organizationId (mesmo
    // princípio do `ScopedQuery` real, D1/D2: org_id sempre no WHERE).
    expect(await repository.findSessionById(ORG, sessionOrgB.id)).toBeNull();
    const listedForOrgA = await repository.findSessionsAll(ORG, {});
    expect(listedForOrgA.find((s) => s.id === sessionOrgB.id)).toBeUndefined();

    const useCase = new CancelCountSessionUseCase(repository, auditLog);
    await expect(
      useCase.execute({ organizationId: ORG, sessionId: sessionOrgB.id, expectedVersion: 1, reason: "tentativa cross-org", actor: "x@fonsat.pt" }),
    ).rejects.toThrow();
  });
});
