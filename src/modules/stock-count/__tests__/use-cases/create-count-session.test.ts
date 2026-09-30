import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { CreateCountSessionUseCase } from "../../application/use-cases/create-count-session.use-case.js";
import { LocationRequiredError, NoActiveLocationError } from "../../domain/errors.js";
import { FakeStockCountRepository } from "../fakes/fake-stock-count-repository.js";
import { FakeStockCountSettings } from "../fakes/fake-stock-count-settings.js";
import { FakeLocationRead } from "../fakes/fake-location-read.js";
import { FakeStockCountAuditLog } from "../fakes/fake-stock-count-audit-log.js";

const ORG = mintOrganizationId("org-test");

function makeUseCase() {
  const repository = new FakeStockCountRepository();
  const settings = new FakeStockCountSettings();
  const locationRead = new FakeLocationRead();
  const auditLog = new FakeStockCountAuditLog();
  const useCase = new CreateCountSessionUseCase(repository, settings, locationRead, auditLog);
  return { repository, settings, locationRead, auditLog, useCase };
}

describe("CreateCountSessionUseCase", () => {
  it("cria a sessão em draft, sem materializar linhas", async () => {
    const { locationRead, useCase } = makeUseCase();
    locationRead.locations = [{ id: "loc-1", name: "Loja MBS", isActive: true }];

    const dto = await useCase.execute({
      organizationId: ORG,
      type: "general",
      scopeDefinition: { categoryIds: ["cat-1"] },
      businessDate: "2026-09-30",
      actor: "manager@fonsat.pt",
    });

    expect(dto.status).toBe("draft");
    expect(dto.lines).toHaveLength(0);
    expect(dto.locationId).toBe("loc-1");
  });

  it("herda blindCount do StockCountSettings como snapshot no momento da criação", async () => {
    const { locationRead, settings, useCase } = makeUseCase();
    locationRead.locations = [{ id: "loc-1", name: "Loja MBS", isActive: true }];
    settings.settings = { defaultTolerance: null, blindCountDefault: false, maxRecounts: 2 };

    const dto = await useCase.execute({
      organizationId: ORG,
      type: "spot",
      scopeDefinition: {},
      businessDate: "2026-09-30",
      actor: "manager@fonsat.pt",
    });

    expect(dto.blindCount).toBe(false);
  });

  it("com uma única loja ativa, seleciona-a automaticamente", async () => {
    const { locationRead, useCase } = makeUseCase();
    locationRead.locations = [{ id: "loc-only", name: "Única loja", isActive: true }];

    const dto = await useCase.execute({
      organizationId: ORG,
      type: "cyclical",
      scopeDefinition: {},
      businessDate: "2026-09-30",
      actor: "manager@fonsat.pt",
    });

    expect(dto.locationId).toBe("loc-only");
  });

  it("exige loja explícita quando há mais que uma loja ativa", async () => {
    const { locationRead, useCase } = makeUseCase();
    locationRead.locations = [
      { id: "loc-1", name: "Loja MBS", isActive: true },
      { id: "loc-2", name: "Loja Gaia", isActive: true },
    ];

    await expect(
      useCase.execute({ organizationId: ORG, type: "general", scopeDefinition: {}, businessDate: "2026-09-30", actor: "manager@fonsat.pt" }),
    ).rejects.toThrow(LocationRequiredError);
  });

  it("sem loja ativa nenhuma, lança NoActiveLocationError", async () => {
    const { useCase } = makeUseCase();
    await expect(
      useCase.execute({ organizationId: ORG, type: "general", scopeDefinition: {}, businessDate: "2026-09-30", actor: "manager@fonsat.pt" }),
    ).rejects.toThrow(NoActiveLocationError);
  });

  it("regista auditoria na criação", async () => {
    const { locationRead, auditLog, useCase } = makeUseCase();
    locationRead.locations = [{ id: "loc-1", name: "Loja MBS", isActive: true }];

    await useCase.execute({ organizationId: ORG, type: "general", scopeDefinition: {}, businessDate: "2026-09-30", actor: "manager@fonsat.pt" });

    expect(auditLog.entries).toHaveLength(1);
    expect(auditLog.entries[0]?.action).toBe("create");
  });
});
