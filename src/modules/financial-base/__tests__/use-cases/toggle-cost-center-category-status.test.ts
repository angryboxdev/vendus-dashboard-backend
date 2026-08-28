import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { CreateCostCenterGroupUseCase } from "../../application/use-cases/create-cost-center-group.use-case.js";
import { CreateCostCenterCategoryUseCase } from "../../application/use-cases/create-cost-center-category.use-case.js";
import { ToggleCostCenterCategoryStatusUseCase } from "../../application/use-cases/toggle-cost-center-category-status.use-case.js";
import { FakeCostCenterGroupRepository } from "../fakes/fake-cost-center-group-repository.js";
import { FakeCostCenterCategoryRepository } from "../fakes/fake-cost-center-category-repository.js";
import { CostCenterCategoryNotFoundError } from "../../domain/errors.js";

const ORG_ID = mintOrganizationId("org-test");

describe("ToggleCostCenterCategoryStatusUseCase", () => {
  async function makeUseCases() {
    const groupRepo = new FakeCostCenterGroupRepository();
    const categoryRepo = new FakeCostCenterCategoryRepository();
    const createGroup = new CreateCostCenterGroupUseCase(groupRepo);
    const createCategory = new CreateCostCenterCategoryUseCase(groupRepo, categoryRepo);
    const toggle = new ToggleCostCenterCategoryStatusUseCase(categoryRepo);
    const group = await createGroup.execute({ organizationId: ORG_ID, code: "CAP", name: "CAPEX" });
    const category = await createCategory.execute({
      organizationId: ORG_ID,
      groupId: group.id,
      code: "CAP.01",
      name: "Equipamentos",
      financialType: "capex",
      affectsDre: false,
      affectsCashflow: true,
      affectsProfitability: false,
    });
    return { toggle, category };
  }

  it("desactiva uma categoria activa", async () => {
    const { toggle, category } = await makeUseCases();

    const result = await toggle.execute({ organizationId: ORG_ID, id: category.id, isActive: false });

    expect(result.isActive).toBe(false);
  });

  it("reactiva uma categoria inactiva", async () => {
    const { toggle, category } = await makeUseCases();
    await toggle.execute({ organizationId: ORG_ID, id: category.id, isActive: false });

    const result = await toggle.execute({ organizationId: ORG_ID, id: category.id, isActive: true });

    expect(result.isActive).toBe(true);
  });

  it("lança NotFound para id inexistente", async () => {
    const { toggle } = await makeUseCases();

    await expect(
      toggle.execute({ organizationId: ORG_ID, id: "nao-existe", isActive: false }),
    ).rejects.toThrow(CostCenterCategoryNotFoundError);
  });
});
