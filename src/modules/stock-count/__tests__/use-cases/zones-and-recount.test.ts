import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { StockCountLine } from "../../domain/entities/stock-count-line.js";
import { RequestRecountUseCase } from "../../application/use-cases/request-recount.use-case.js";
import { ListCountZonesUseCase } from "../../application/use-cases/list-count-zones.use-case.js";
import { CreateCountZoneUseCase } from "../../application/use-cases/create-count-zone.use-case.js";
import { LineNotCountedYetError } from "../../domain/errors.js";
import { FakeStockCountRepository } from "../fakes/fake-stock-count-repository.js";
import { FakeStockCountAuditLog } from "../fakes/fake-stock-count-audit-log.js";
import { FakeStockCountZone } from "../fakes/fake-stock-count-zone.js";

const ORG = mintOrganizationId("org-test");

describe("RequestRecountUseCase", () => {
  it("marca uma linha contada como recount_required (motivo opcional)", async () => {
    const repository = new FakeStockCountRepository();
    const auditLog = new FakeStockCountAuditLog();
    const line = StockCountLine.create({ organizationId: ORG, sessionId: "session-1", itemId: "item-1" }).recordAttemptOutcome({
      selectedAttemptId: "a-1",
      finalCountedQuantity: 8,
      finalSystemQuantity: 10,
      finalVariance: -2,
      variancePercent: 0.2,
      varianceValue: null,
      toleranceSnapshot: null,
      movementsDuringCount: false,
      breachesTolerance: false,
    });
    repository.seedLine(line);
    const useCase = new RequestRecountUseCase(repository, auditLog);

    const dto = await useCase.execute({ organizationId: ORG, lineId: line.id, expectedVersion: line.version, actor: "gerente@fonsat.pt" });
    expect(dto.status).toBe("recount_required");
  });

  it("nunca pede recontagem de uma linha ainda não contada", async () => {
    const repository = new FakeStockCountRepository();
    const auditLog = new FakeStockCountAuditLog();
    const line = StockCountLine.create({ organizationId: ORG, sessionId: "session-1", itemId: "item-1" });
    repository.seedLine(line);
    const useCase = new RequestRecountUseCase(repository, auditLog);

    await expect(
      useCase.execute({ organizationId: ORG, lineId: line.id, expectedVersion: line.version, actor: "gerente@fonsat.pt" }),
    ).rejects.toThrow(LineNotCountedYetError);
  });
});

describe("Zonas (CRUD simples, secção 5/25/55)", () => {
  it("cria e lista zonas por loja", async () => {
    const zones = new FakeStockCountZone();
    const createUseCase = new CreateCountZoneUseCase(zones);
    const listUseCase = new ListCountZonesUseCase(zones);

    await createUseCase.execute({ organizationId: ORG, locationId: "loc-1", name: "Câmara fria" });
    await createUseCase.execute({ organizationId: ORG, locationId: "loc-1", name: "Arrumos", sortOrder: 1 });

    const result = await listUseCase.execute({ organizationId: ORG, locationId: "loc-1" });
    expect(result).toHaveLength(2);
    expect(result[0]?.name).toBe("Câmara fria");
  });
});
