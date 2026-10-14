import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { SuggestStockRoutingUseCase } from "../../application/use-cases/suggest-stock-routing.use-case.js";
import { FakeCostCenterCategoryRead } from "../fakes/fake-cost-center-category-read.js";
import { FakeSupplierRead } from "../fakes/fake-supplier-read.js";

const ORG = mintOrganizationId("org-test");

describe("SuggestStockRoutingUseCase", () => {
  test("lê exceção da loja, política do fornecedor e categorias", async () => {
    const cats = new FakeCostCenterCategoryRead();
    const sup = new FakeSupplierRead();
    sup.policies.set("makro", "usually_creates_review");
    sup.locationPolicies.set("makro:loc-mbs", "usually_skips_review");
    const uc = new SuggestStockRoutingUseCase(cats, sup);
    expect(await uc.execute({ organizationId: ORG, supplierId: "makro", locationId: "loc-mbs", categoryIds: [] })).toMatchObject({ send: false, source: "supplier_location" });
    expect(await uc.execute({ organizationId: ORG, supplierId: "makro", locationId: "loc-outra", categoryIds: [] })).toMatchObject({ send: true, source: "supplier" });
    expect(await uc.execute({ organizationId: ORG, supplierId: null, locationId: null, categoryIds: [] })).toMatchObject({ source: "none" });
  });
});
