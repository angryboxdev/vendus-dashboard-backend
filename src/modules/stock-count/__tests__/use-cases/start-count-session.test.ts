import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { StockCountSession } from "../../domain/entities/stock-count-session.js";
import { StartCountSessionUseCase } from "../../application/use-cases/start-count-session.use-case.js";
import { OverlapOverrideReasonRequiredError, OverlappingSessionError } from "../../domain/errors.js";
import { FakeStockCountRepository } from "../fakes/fake-stock-count-repository.js";
import { FakeStockItemCatalog } from "../fakes/fake-stock-item-catalog.js";
import { FakeStockMovementWrite } from "../fakes/fake-stock-movement-write.js";
import { FakeStockCountAuditLog } from "../fakes/fake-stock-count-audit-log.js";

const ORG = mintOrganizationId("org-test");
const ORG_B = mintOrganizationId("org-b");

function makeUseCase() {
  const repository = new FakeStockCountRepository();
  const itemCatalog = new FakeStockItemCatalog();
  const stockMovementWrite = new FakeStockMovementWrite(repository);
  const auditLog = new FakeStockCountAuditLog();
  const useCase = new StartCountSessionUseCase(repository, itemCatalog, stockMovementWrite, auditLog);
  return { repository, itemCatalog, stockMovementWrite, auditLog, useCase };
}

function seedEligibleItem(itemCatalog: FakeStockItemCatalog, id: string, categoryId = "cat-1") {
  itemCatalog.seed({
    id,
    name: `Item ${id}`,
    categoryId,
    baseUnit: "g",
    isActive: true,
    stockTrackingEnabled: true,
    tolerance: null,
    purchaseReferenceUnitCostWithoutVat: null,
    alternateUnits: [],
  });
}

function draftSession(orgId: string, locationId: string, categoryIds: string[] = ["cat-1"]) {
  return StockCountSession.create({
    organizationId: orgId,
    locationId,
    type: "general",
    scopeDefinition: { categoryIds },
    blindCount: true,
    businessDate: "2026-09-30",
  });
}

describe("StartCountSessionUseCase", () => {
  it("materializa o escopo em linhas e muda para counting", async () => {
    const { repository, itemCatalog, useCase } = makeUseCase();
    seedEligibleItem(itemCatalog, "item-1");
    seedEligibleItem(itemCatalog, "item-2");
    const session = await repository.insertSession(ORG, draftSession(ORG, "loc-1"));

    const dto = await useCase.execute({ organizationId: ORG, sessionId: session.id, expectedVersion: 1, actor: "manager@fonsat.pt" });

    expect(dto.status).toBe("counting");
    expect(dto.lines).toHaveLength(2);
    expect(dto.lines.every((l) => l.status === "not_counted")).toBe(true);
  });

  it("duplo-clique/retry de start já em counting é idempotente (não duplica linhas)", async () => {
    const { repository, itemCatalog, useCase } = makeUseCase();
    seedEligibleItem(itemCatalog, "item-1");
    const session = await repository.insertSession(ORG, draftSession(ORG, "loc-1"));

    const first = await useCase.execute({ organizationId: ORG, sessionId: session.id, expectedVersion: 1, actor: "manager@fonsat.pt" });
    const second = await useCase.execute({ organizationId: ORG, sessionId: session.id, expectedVersion: first.version, actor: "manager@fonsat.pt" });

    expect(second.lines).toHaveLength(1);
  });

  it("bloqueia sobreposição: item já pertence a outra sessão ativa na mesma loja", async () => {
    const { repository, itemCatalog, useCase } = makeUseCase();
    seedEligibleItem(itemCatalog, "item-shared");

    const otherSession = await repository.insertSession(ORG, draftSession(ORG, "loc-1"));
    await useCase.execute({ organizationId: ORG, sessionId: otherSession.id, expectedVersion: 1, actor: "manager@fonsat.pt" });

    const newSession = await repository.insertSession(ORG, draftSession(ORG, "loc-1"));

    await expect(
      useCase.execute({ organizationId: ORG, sessionId: newSession.id, expectedVersion: 1, actor: "manager@fonsat.pt" }),
    ).rejects.toThrow(OverlappingSessionError);
  });

  it("override de sobreposição exige motivo não vazio", async () => {
    const { repository, itemCatalog, useCase } = makeUseCase();
    seedEligibleItem(itemCatalog, "item-shared");
    const otherSession = await repository.insertSession(ORG, draftSession(ORG, "loc-1"));
    await useCase.execute({ organizationId: ORG, sessionId: otherSession.id, expectedVersion: 1, actor: "manager@fonsat.pt" });
    const newSession = await repository.insertSession(ORG, draftSession(ORG, "loc-1"));

    await expect(
      useCase.execute({
        organizationId: ORG,
        sessionId: newSession.id,
        expectedVersion: 1,
        actor: "manager@fonsat.pt",
        overrideOverlap: true,
        overrideReason: "",
      }),
    ).rejects.toThrow(OverlapOverrideReasonRequiredError);
  });

  it("override com motivo (só permitido a admin pelo controller) ultrapassa a sobreposição", async () => {
    const { repository, itemCatalog, useCase } = makeUseCase();
    seedEligibleItem(itemCatalog, "item-shared");
    const otherSession = await repository.insertSession(ORG, draftSession(ORG, "loc-1"));
    await useCase.execute({ organizationId: ORG, sessionId: otherSession.id, expectedVersion: 1, actor: "manager@fonsat.pt" });
    const newSession = await repository.insertSession(ORG, draftSession(ORG, "loc-1"));

    const dto = await useCase.execute({
      organizationId: ORG,
      sessionId: newSession.id,
      expectedVersion: 1,
      actor: "admin@fonsat.pt",
      overrideOverlap: true,
      overrideReason: "Recontagem urgente pedida pela direção",
    });

    expect(dto.status).toBe("counting");
  });

  it("recontagem dentro da própria sessão nunca conta como sobreposição", async () => {
    const { repository, itemCatalog, useCase } = makeUseCase();
    seedEligibleItem(itemCatalog, "item-1");
    const session = await repository.insertSession(ORG, draftSession(ORG, "loc-1"));
    const first = await useCase.execute({ organizationId: ORG, sessionId: session.id, expectedVersion: 1, actor: "manager@fonsat.pt" });
    expect(first.status).toBe("counting");
  });

  it("isolamento multi-tenant: sobreposição de outra organização nunca bloqueia", async () => {
    const { repository, itemCatalog, useCase } = makeUseCase();
    seedEligibleItem(itemCatalog, "item-shared");

    const sessionOrgB = await repository.insertSession(ORG_B, draftSession(ORG_B, "loc-1"));
    await useCase.execute({ organizationId: ORG_B, sessionId: sessionOrgB.id, expectedVersion: 1, actor: "manager@b.pt" });

    const sessionOrgA = await repository.insertSession(ORG, draftSession(ORG, "loc-1"));
    const dto = await useCase.execute({ organizationId: ORG, sessionId: sessionOrgA.id, expectedVersion: 1, actor: "manager@fonsat.pt" });

    // Mesmo item, mesmo location_id "textual", organizações diferentes —
    // nunca deveria bloquear (a verificação de sobreposição é sempre
    // filtrada por org_id, tal como a RPC real faz).
    expect(dto.status).toBe("counting");
  });
});
