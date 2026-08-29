import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { CreateCostCenterGroupUseCase } from "../../application/use-cases/create-cost-center-group.use-case.js";
import { CreateCostCenterCategoryUseCase } from "../../application/use-cases/create-cost-center-category.use-case.js";
import { UpdateCostCenterCategoryUseCase } from "../../application/use-cases/update-cost-center-category.use-case.js";
import { FakeCostCenterGroupRepository } from "../fakes/fake-cost-center-group-repository.js";
import { FakeCostCenterCategoryRepository } from "../fakes/fake-cost-center-category-repository.js";
import { CostCenterCategoryNotFoundError } from "../../domain/errors.js";

const ORG_ID = mintOrganizationId("org-test");

describe("UpdateCostCenterCategoryUseCase", () => {
  async function makeUseCases() {
    const groupRepo = new FakeCostCenterGroupRepository();
    const categoryRepo = new FakeCostCenterCategoryRepository();
    const createGroup = new CreateCostCenterGroupUseCase(groupRepo);
    const createCategory = new CreateCostCenterCategoryUseCase(groupRepo, categoryRepo);
    const updateCategory = new UpdateCostCenterCategoryUseCase(categoryRepo);
    const group = await createGroup.execute({ organizationId: ORG_ID, code: "OPD", name: "Operação Direta" });
    const category = await createCategory.execute({
      organizationId: ORG_ID,
      groupId: group.id,
      code: "OPD.01",
      name: "CMV",
      financialType: "cmv",
      affectsDre: true,
      affectsCashflow: true,
      affectsProfitability: true,
    });
    return { updateCategory, category };
  }

  it("actualiza campos financeiros da categoria", async () => {
    const { updateCategory, category } = await makeUseCases();

    const result = await updateCategory.execute({
      organizationId: ORG_ID,
      id: category.id,
      data: { name: "CMV / Ingredientes", requiresChannel: true },
    });

    expect(result.name).toBe("CMV / Ingredientes");
    expect(result.requiresChannel).toBe(true);
    expect(result.code).toBe("OPD.01");
  });

  it("lança NotFound para id inexistente", async () => {
    const { updateCategory } = await makeUseCases();

    await expect(
      updateCategory.execute({ organizationId: ORG_ID, id: "nao-existe", data: { name: "X" } }),
    ).rejects.toThrow(CostCenterCategoryNotFoundError);
  });
});
