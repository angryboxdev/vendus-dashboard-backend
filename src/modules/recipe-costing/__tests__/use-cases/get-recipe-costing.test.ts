import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { GetRecipeCostingUseCase } from "../../application/use-cases/get-recipe-costing.use-case.js";
import { FakeRecipeCostingRead } from "../fakes/fake-recipe-costing-read.js";
import { FakeMenuCostingSettings } from "../fakes/fake-menu-costing-settings.js";

const ORG = mintOrganizationId("org-test");

describe("GetRecipeCostingUseCase", () => {
  it("lê o snapshot da organização e devolve o custo calculado", async () => {
    const reader = new FakeRecipeCostingRead();
    reader.snapshot = {
      preparations: [],
      ingredients: [{ stockItemId: "farinha", name: "Farinha", baseUnit: "g", unitCostWithoutVat: 0.002, source: "invoice" }],
      dishes: [{
        pizzaId: "p1", name: "Margherita", category: "classics", isActive: true,
        prices: [{ size: "small", price: 8 }],
        lines: [{ stockItemId: "farinha", preparationId: null, size: "small", quantity: 250, wasteFactor: null }],
      }],
    };

    const report = await new GetRecipeCostingUseCase(reader, new FakeMenuCostingSettings()).execute({ organizationId: ORG });

    expect(reader.calls).toEqual([ORG]);
    expect(report.dishes[0]!.sizes[0]).toMatchObject({ costWithoutVat: 0.5, salePrice: 8, complete: true });
    expect(report.missingPrices).toEqual([]);
  });
});
