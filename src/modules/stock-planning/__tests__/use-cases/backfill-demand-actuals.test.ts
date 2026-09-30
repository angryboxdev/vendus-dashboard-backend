import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { BackfillDemandActualsUseCase } from "../../application/use-cases/backfill-demand-actuals.use-case.js";
import { FakeDemandActualsRepository } from "../fakes/fake-demand-actuals-repository.js";
import { FakeLocationRead } from "../fakes/fake-location-read.js";
import { FakeVendusSalesRead } from "../fakes/fake-vendus-sales-read.js";

const ORG = mintOrganizationId("org-test");

describe("BackfillDemandActualsUseCase", () => {
  it("processa cada dia do intervalo e regista falhas isoladas sem interromper o resto", async () => {
    const locationRead = new FakeLocationRead();
    locationRead.locations = [{ id: "loc-1", name: "Loja", isActive: true }];
    const vendusSalesRead = new FakeVendusSalesRead();
    vendusSalesRead.byDate.set("2026-09-01", [{ demandSourceType: "stock", demandSourceRef: "tomate", saleDate: "2026-09-01", quantitySold: 5 }]);
    const originalFetch = vendusSalesRead.fetchDailyActuals.bind(vendusSalesRead);
    vendusSalesRead.fetchDailyActuals = async (orgId, locationId, date) => {
      if (date === "2026-09-02") throw new Error("Vendus API indisponível");
      return originalFetch(orgId, locationId, date);
    };

    const demandActualsRepo = new FakeDemandActualsRepository();
    const useCase = new BackfillDemandActualsUseCase(locationRead, vendusSalesRead, demandActualsRepo);

    const result = await useCase.execute({ organizationId: ORG, since: "2026-09-01", until: "2026-09-03" });
    expect(result).toHaveLength(1);
    expect(result[0]?.daysProcessed).toBe(2);
    expect(result[0]?.daysFailed).toEqual(["2026-09-02"]);
    expect(demandActualsRepo.rows.some((r) => r.saleDate === "2026-09-01")).toBe(true);
  });
});
