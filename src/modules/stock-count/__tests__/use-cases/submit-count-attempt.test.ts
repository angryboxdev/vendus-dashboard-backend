import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { StockCountSession } from "../../domain/entities/stock-count-session.js";
import { StockCountLine } from "../../domain/entities/stock-count-line.js";
import { SubmitCountAttemptUseCase } from "../../application/use-cases/submit-count-attempt.use-case.js";
import { LineLockedByAnotherUserError, StaleCountLineVersionError, UnknownCountUnitError } from "../../domain/errors.js";
import { FakeStockCountRepository } from "../fakes/fake-stock-count-repository.js";
import { FakeStockItemCatalog } from "../fakes/fake-stock-item-catalog.js";
import { FakeStockCategoryRead } from "../fakes/fake-stock-category-read.js";
import { FakeStockCountSettings } from "../fakes/fake-stock-count-settings.js";
import { FakeStockMovementWrite } from "../fakes/fake-stock-movement-write.js";
import { FakeStockCountAuditLog } from "../fakes/fake-stock-count-audit-log.js";

const ORG = mintOrganizationId("org-test");

function makeUseCase() {
  const repository = new FakeStockCountRepository();
  const itemCatalog = new FakeStockItemCatalog();
  const categoryRead = new FakeStockCategoryRead();
  const settings = new FakeStockCountSettings();
  const stockMovementWrite = new FakeStockMovementWrite(repository);
  const auditLog = new FakeStockCountAuditLog();
  const useCase = new SubmitCountAttemptUseCase(repository, itemCatalog, categoryRead, settings, stockMovementWrite, auditLog);
  return { repository, itemCatalog, categoryRead, settings, stockMovementWrite, auditLog, useCase };
}

function seedCountingSessionWithLine(repository: FakeStockCountRepository, itemId = "item-1", locationId = "loc-1") {
  const session = StockCountSession.create({
    organizationId: ORG,
    locationId,
    type: "general",
    scopeDefinition: {},
    blindCount: true,
    businessDate: "2026-09-30",
  }).start("manager@fonsat.pt");
  repository.seedSession(session);
  const line = StockCountLine.create({ organizationId: ORG, sessionId: session.id, itemId });
  repository.seedLine(line);
  return { session, line };
}

function seedItem(itemCatalog: FakeStockItemCatalog, id: string, overrides: Partial<Parameters<FakeStockItemCatalog["seed"]>[0]> = {}) {
  itemCatalog.seed({
    id,
    name: `Item ${id}`,
    categoryId: "cat-1",
    baseUnit: "g",
    isActive: true,
    stockTrackingEnabled: true,
    tolerance: null,
    purchaseReferenceUnitCostWithoutVat: null,
    alternateUnits: [],
    ...overrides,
  });
}

describe("SubmitCountAttemptUseCase", () => {
  it("variância normal: contado diferente do teórico", async () => {
    const { repository, itemCatalog, stockMovementWrite, useCase } = makeUseCase();
    const { line } = seedCountingSessionWithLine(repository);
    seedItem(itemCatalog, "item-1");
    stockMovementWrite.addMovement("item-1", "loc-1", 10, new Date("2026-09-30T08:00:00Z"));

    const dto = await useCase.execute({
      organizationId: ORG,
      lineId: line.id,
      expectedLineVersion: 1,
      components: [{ quantity: 8, unit: "g" }],
      countStartedAt: "2026-09-30T09:00:00Z",
      actor: "ana@fonsat.pt",
    });

    expect(dto.status).toBe("counted");
    expect(dto.finalVariance).toBe(-2);
    expect(dto.finalSystemQuantity).toBe(10);
  });

  it("sem diferença: contado igual ao teórico", async () => {
    const { repository, itemCatalog, stockMovementWrite, useCase } = makeUseCase();
    const { line } = seedCountingSessionWithLine(repository);
    seedItem(itemCatalog, "item-1");
    stockMovementWrite.addMovement("item-1", "loc-1", 10, new Date("2026-09-30T08:00:00Z"));

    const dto = await useCase.execute({
      organizationId: ORG,
      lineId: line.id,
      expectedLineVersion: 1,
      components: [{ quantity: 10, unit: "g" }],
      countStartedAt: "2026-09-30T09:00:00Z",
      actor: "ana@fonsat.pt",
    });

    expect(dto.finalVariance).toBe(0);
    expect(dto.status).toBe("counted");
  });

  it("contado explicitamente zero é um valor real, nunca 'não contado'", async () => {
    const { repository, itemCatalog, stockMovementWrite, useCase } = makeUseCase();
    const { line } = seedCountingSessionWithLine(repository);
    seedItem(itemCatalog, "item-1");
    stockMovementWrite.addMovement("item-1", "loc-1", 5, new Date("2026-09-30T08:00:00Z"));

    const dto = await useCase.execute({
      organizationId: ORG,
      lineId: line.id,
      expectedLineVersion: 1,
      components: [{ quantity: 0, unit: "g" }],
      countStartedAt: "2026-09-30T09:00:00Z",
      actor: "ana@fonsat.pt",
    });

    expect(dto.finalCountedQuantity).toBe(0);
    expect(dto.finalVariance).toBe(-5);
  });

  it("linha nunca submetida continua not_counted (empty ≠ zero)", async () => {
    const { repository } = makeUseCase();
    const { line } = seedCountingSessionWithLine(repository);
    expect(line.status).toBe("not_counted");
    expect(line.toProps().finalCountedQuantity).toBeNull();
  });

  it("stock teórico zero: percent null, sem crash", async () => {
    const { repository, itemCatalog, useCase } = makeUseCase();
    const { line } = seedCountingSessionWithLine(repository);
    seedItem(itemCatalog, "item-1");

    const dto = await useCase.execute({
      organizationId: ORG,
      lineId: line.id,
      expectedLineVersion: 1,
      components: [{ quantity: 3, unit: "g" }],
      countStartedAt: "2026-09-30T09:00:00Z",
      actor: "ana@fonsat.pt",
    });

    expect(dto.variancePercent).toBeNull();
    expect(dto.finalVariance).toBe(3);
  });

  it("stock teórico negativo: percent null, sem crash", async () => {
    const { repository, itemCatalog, stockMovementWrite, useCase } = makeUseCase();
    const { line } = seedCountingSessionWithLine(repository);
    seedItem(itemCatalog, "item-1");
    stockMovementWrite.addMovement("item-1", "loc-1", -5, new Date("2026-09-30T08:00:00Z"));

    const dto = await useCase.execute({
      organizationId: ORG,
      lineId: line.id,
      expectedLineVersion: 1,
      components: [{ quantity: 2, unit: "g" }],
      countStartedAt: "2026-09-30T09:00:00Z",
      actor: "ana@fonsat.pt",
    });

    expect(dto.variancePercent).toBeNull();
    expect(dto.finalSystemQuantity).toBe(-5);
  });

  it("múltiplas unidades de contagem somam corretamente em unidade base", async () => {
    const { repository, itemCatalog, useCase } = makeUseCase();
    const { line } = seedCountingSessionWithLine(repository);
    seedItem(itemCatalog, "item-1", { baseUnit: "g", alternateUnits: [{ unitLabel: "saco", conversionFactorToBase: 5000 }] });

    const dto = await useCase.execute({
      organizationId: ORG,
      lineId: line.id,
      expectedLineVersion: 1,
      components: [
        { quantity: 2, unit: "saco" },
        { quantity: 300, unit: "g" },
      ],
      countStartedAt: "2026-09-30T09:00:00Z",
      actor: "ana@fonsat.pt",
    });

    expect(dto.finalCountedQuantity).toBe(10300);
    expect(dto.attempts[0]?.components).toHaveLength(2);
  });

  it("unidade desconhecida (nem base nem configurada) lança UnknownCountUnitError", async () => {
    const { repository, itemCatalog, useCase } = makeUseCase();
    const { line } = seedCountingSessionWithLine(repository);
    seedItem(itemCatalog, "item-1");

    await expect(
      useCase.execute({
        organizationId: ORG,
        lineId: line.id,
        expectedLineVersion: 1,
        components: [{ quantity: 1, unit: "caixa" }],
        countStartedAt: "2026-09-30T09:00:00Z",
        actor: "ana@fonsat.pt",
      }),
    ).rejects.toThrow(UnknownCountUnitError);
  });

  it("movimento DEPOIS da contagem não recalcula retroativamente a variância já postada", async () => {
    const { repository, itemCatalog, stockMovementWrite, useCase } = makeUseCase();
    const { line } = seedCountingSessionWithLine(repository);
    seedItem(itemCatalog, "item-1");
    stockMovementWrite.addMovement("item-1", "loc-1", 10, new Date("2026-09-30T08:00:00Z"));

    const dto = await useCase.execute({
      organizationId: ORG,
      lineId: line.id,
      expectedLineVersion: 1,
      components: [{ quantity: 10, unit: "g" }],
      countStartedAt: "2026-09-30T09:00:00Z",
      actor: "ana@fonsat.pt",
    });
    expect(dto.finalVariance).toBe(0);
    expect(dto.status).toBe("counted");

    // Um movimento registado DEPOIS da contagem (ex: uma venda) nunca reabre a linha.
    stockMovementWrite.addMovement("item-1", "loc-1", -3, new Date("2026-09-30T10:00:00Z"));
    const unchanged = await repository.findLineById(ORG, line.id);
    expect(unchanged?.status).toBe("counted");
    expect(unchanged?.toProps().finalVariance).toBe(0);
  });

  it("movimento DURANTE a contagem sinaliza recontagem, mesmo dentro da tolerância", async () => {
    const { repository, itemCatalog, stockMovementWrite, useCase } = makeUseCase();
    const { line } = seedCountingSessionWithLine(repository);
    seedItem(itemCatalog, "item-1", { tolerance: { absoluteQty: 1000 } });
    stockMovementWrite.addMovement("item-1", "loc-1", 10, new Date("2026-09-30T08:00:00Z"));
    // Movimento registado DEPOIS de count_started_at (09:00) mas ANTES de a
    // tentativa ser submetida — o fake modela "agora" pela ordem de chamada
    // (este `addMovement` corre antes de `useCase.execute`), nunca pelo
    // relógio real da máquina.
    stockMovementWrite.addMovement("item-1", "loc-1", 5, new Date("2026-09-30T09:30:00Z"));

    const dto = await useCase.execute({
      organizationId: ORG,
      lineId: line.id,
      expectedLineVersion: 1,
      components: [{ quantity: 10, unit: "g" }],
      countStartedAt: "2026-09-30T09:00:00Z",
      actor: "ana@fonsat.pt",
    });

    expect(dto.status).toBe("recount_required");
  });

  it("dois recontagens sucessivas: cada tentativa é comparada contra o SEU PRÓPRIO snapshot teórico", async () => {
    const { repository, itemCatalog, stockMovementWrite, useCase } = makeUseCase();
    const { line } = seedCountingSessionWithLine(repository);
    seedItem(itemCatalog, "item-1");
    stockMovementWrite.addMovement("item-1", "loc-1", 10, new Date("2026-09-30T08:00:00Z"));

    const first = await useCase.execute({
      organizationId: ORG,
      lineId: line.id,
      expectedLineVersion: 1,
      components: [{ quantity: 7, unit: "g" }],
      countStartedAt: "2026-09-30T09:00:00Z",
      actor: "ana@fonsat.pt",
    });
    expect(first.finalSystemQuantity).toBe(10);

    // Entre as duas tentativas o teórico muda (nova compra) — a 2ª tentativa
    // tem de comparar contra o SEU PRÓPRIO snapshot (20), nunca contra o da 1ª (10).
    stockMovementWrite.addMovement("item-1", "loc-1", 10, new Date("2026-09-30T09:30:00Z"));

    const second = await useCase.execute({
      organizationId: ORG,
      lineId: line.id,
      expectedLineVersion: first.version,
      components: [{ quantity: 18, unit: "g" }],
      countStartedAt: "2026-09-30T10:00:00Z",
      actor: "ana@fonsat.pt",
    });

    expect(second.finalSystemQuantity).toBe(20);
    expect(second.finalVariance).toBe(-2);
    expect(second.attempts).toHaveLength(2);
    expect(second.attempts[0]?.systemQuantityAtCount).toBe(10);
    expect(second.attempts[1]?.systemQuantityAtCount).toBe(20);
  });

  it("conflito de versão obsoleta em submissão concorrente da mesma linha", async () => {
    const { repository, itemCatalog, useCase } = makeUseCase();
    const { line } = seedCountingSessionWithLine(repository);
    seedItem(itemCatalog, "item-1");

    await useCase.execute({
      organizationId: ORG,
      lineId: line.id,
      expectedLineVersion: 1,
      components: [{ quantity: 5, unit: "g" }],
      countStartedAt: "2026-09-30T09:00:00Z",
      actor: "ana@fonsat.pt",
    });

    // Segunda tentativa concorrente ainda usa a versão antiga (1).
    await expect(
      useCase.execute({
        organizationId: ORG,
        lineId: line.id,
        expectedLineVersion: 1,
        components: [{ quantity: 6, unit: "g" }],
        countStartedAt: "2026-09-30T09:01:00Z",
        actor: "bruno@fonsat.pt",
      }),
    ).rejects.toThrow(StaleCountLineVersionError);
  });

  it("lease: dois utilizadores na mesma linha — o segundo é bloqueado enquanto o lease do primeiro está ativo", async () => {
    const { repository, itemCatalog, useCase } = makeUseCase();
    const { line } = seedCountingSessionWithLine(repository);
    seedItem(itemCatalog, "item-1");

    // Ana reivindica o lease ao submeter (mesmo antes de terminar).
    await repository.saveLine(ORG, line.claimLease("ana@fonsat.pt", new Date()));

    await expect(
      useCase.execute({
        organizationId: ORG,
        lineId: line.id,
        expectedLineVersion: 1,
        components: [{ quantity: 6, unit: "g" }],
        countStartedAt: "2026-09-30T09:01:00Z",
        actor: "bruno@fonsat.pt",
      }),
    ).rejects.toThrow(LineLockedByAnotherUserError);
  });

  it("utilizadores diferentes em linhas (zonas) diferentes contam em paralelo sem conflito", async () => {
    const { repository, itemCatalog, useCase } = makeUseCase();
    const { session } = seedCountingSessionWithLine(repository, "item-1");
    const line2 = StockCountLine.create({ organizationId: ORG, sessionId: session.id, itemId: "item-2" });
    repository.seedLine(line2);
    seedItem(itemCatalog, "item-1");
    seedItem(itemCatalog, "item-2");

    const [dto1, dto2] = await Promise.all([
      useCase.execute({
        organizationId: ORG,
        lineId: (await repository.findLinesBySessionId(ORG, session.id))[0]!.id,
        expectedLineVersion: 1,
        components: [{ quantity: 1, unit: "g" }],
        countStartedAt: "2026-09-30T09:00:00Z",
        actor: "ana@fonsat.pt",
      }),
      useCase.execute({
        organizationId: ORG,
        lineId: line2.id,
        expectedLineVersion: 1,
        components: [{ quantity: 2, unit: "g" }],
        countStartedAt: "2026-09-30T09:00:00Z",
        actor: "bruno@fonsat.pt",
      }),
    ]);

    expect(dto1.status).toBe("counted");
    expect(dto2.status).toBe("counted");
  });
});
