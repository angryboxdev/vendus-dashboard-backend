import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { StockCountSession } from "../../domain/entities/stock-count-session.js";
import { AddUnscopedItemToSessionUseCase } from "../../application/use-cases/add-unscoped-item-to-session.use-case.js";
import { ItemAlreadyInScopeError, SessionNotCountingError, StockItemNotEligibleError } from "../../domain/errors.js";
import { FakeStockCountRepository } from "../fakes/fake-stock-count-repository.js";
import { FakeStockItemCatalog } from "../fakes/fake-stock-item-catalog.js";
import { FakeStockCountAuditLog } from "../fakes/fake-stock-count-audit-log.js";

const ORG = mintOrganizationId("org-test");

function makeUseCase() {
  const repository = new FakeStockCountRepository();
  const itemCatalog = new FakeStockItemCatalog();
  const auditLog = new FakeStockCountAuditLog();
  const useCase = new AddUnscopedItemToSessionUseCase(repository, itemCatalog, auditLog);
  return { repository, itemCatalog, auditLog, useCase };
}

function countingSession() {
  return StockCountSession.create({
    organizationId: ORG,
    locationId: "loc-1",
    type: "general",
    scopeDefinition: {},
    blindCount: true,
    businessDate: "2026-09-30",
  }).start("manager@fonsat.pt");
}

describe("AddUnscopedItemToSessionUseCase — 'item não previsto' (secção 57)", () => {
  it("permite adicionar um item existente elegível a uma sessão já iniciada, sempre auditado", async () => {
    const { repository, itemCatalog, auditLog, useCase } = makeUseCase();
    const session = countingSession();
    repository.seedSession(session);
    itemCatalog.seed({
      id: "item-extra",
      name: "Item Extra",
      categoryId: "cat-1",
      baseUnit: "un",
      isActive: true,
      stockTrackingEnabled: true,
      tolerance: null,
      purchaseReferenceUnitCostWithoutVat: null,
      alternateUnits: [],
    });

    const dto = await useCase.execute({ organizationId: ORG, sessionId: session.id, itemId: "item-extra", actor: "ana@fonsat.pt" });

    expect(dto.isUnscoped).toBe(true);
    expect(auditLog.entries.some((e) => e.action === "add_unscoped_item")).toBe(true);
  });

  it("cria um item novo a partir do fluxo de contagem — nasce sempre a quantidade 0, nunca com movimento inicial", async () => {
    const { repository, useCase } = makeUseCase();
    const session = countingSession();
    repository.seedSession(session);

    const dto = await useCase.execute({
      organizationId: ORG,
      sessionId: session.id,
      newItem: { name: "Farinha 00", categoryId: "cat-1", type: "ingredient", baseUnit: "g" },
      actor: "ana@fonsat.pt",
    });

    expect(dto.status).toBe("not_counted");
    expect(dto.finalCountedQuantity).toBeNull();
  });

  it("item inativo ou sem controlo de stock ativado nunca é elegível", async () => {
    const { repository, itemCatalog, useCase } = makeUseCase();
    const session = countingSession();
    repository.seedSession(session);
    itemCatalog.seed({
      id: "item-inactive",
      name: "Item Inativo",
      categoryId: "cat-1",
      baseUnit: "un",
      isActive: false,
      stockTrackingEnabled: true,
      tolerance: null,
      purchaseReferenceUnitCostWithoutVat: null,
      alternateUnits: [],
    });

    await expect(
      useCase.execute({ organizationId: ORG, sessionId: session.id, itemId: "item-inactive", actor: "ana@fonsat.pt" }),
    ).rejects.toThrow(StockItemNotEligibleError);
  });

  it("nunca duplica uma linha já existente para o mesmo item", async () => {
    const { repository, itemCatalog, useCase } = makeUseCase();
    const session = countingSession();
    repository.seedSession(session);
    itemCatalog.seed({
      id: "item-1",
      name: "Item 1",
      categoryId: "cat-1",
      baseUnit: "un",
      isActive: true,
      stockTrackingEnabled: true,
      tolerance: null,
      purchaseReferenceUnitCostWithoutVat: null,
      alternateUnits: [],
    });
    await useCase.execute({ organizationId: ORG, sessionId: session.id, itemId: "item-1", actor: "ana@fonsat.pt" });

    await expect(useCase.execute({ organizationId: ORG, sessionId: session.id, itemId: "item-1", actor: "ana@fonsat.pt" })).rejects.toThrow(
      ItemAlreadyInScopeError,
    );
  });

  it("só permite adicionar item enquanto a sessão está em contagem", async () => {
    const { repository, itemCatalog, useCase } = makeUseCase();
    const draft = StockCountSession.create({
      organizationId: ORG,
      locationId: "loc-1",
      type: "general",
      scopeDefinition: {},
      blindCount: true,
      businessDate: "2026-09-30",
    });
    repository.seedSession(draft);
    itemCatalog.seed({
      id: "item-1",
      name: "Item 1",
      categoryId: "cat-1",
      baseUnit: "un",
      isActive: true,
      stockTrackingEnabled: true,
      tolerance: null,
      purchaseReferenceUnitCostWithoutVat: null,
      alternateUnits: [],
    });

    await expect(useCase.execute({ organizationId: ORG, sessionId: draft.id, itemId: "item-1", actor: "ana@fonsat.pt" })).rejects.toThrow(
      SessionNotCountingError,
    );
  });
});
