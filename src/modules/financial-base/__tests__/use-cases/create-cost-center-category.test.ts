import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { CreateCostCenterGroupUseCase } from "../../application/use-cases/create-cost-center-group.use-case.js";
import { CreateCostCenterCategoryUseCase } from "../../application/use-cases/create-cost-center-category.use-case.js";
import { FakeCostCenterGroupRepository } from "../fakes/fake-cost-center-group-repository.js";
import { FakeCostCenterCategoryRepository } from "../fakes/fake-cost-center-category-repository.js";
import {
  CostCenterGroupNotFoundError,
  CostCenterCategoryCodeAlreadyExistsError,
} from "../../domain/errors.js";

const ORG_ID = mintOrganizationId("org-test");

describe("CreateCostCenterCategoryUseCase", () => {
  async function makeUseCases() {
    const groupRepo = new FakeCostCenterGroupRepository();
    const categoryRepo = new FakeCostCenterCategoryRepository();
    const createGroup = new CreateCostCenterGroupUseCase(groupRepo);
    const createCategory = new CreateCostCenterCategoryUseCase(groupRepo, categoryRepo);
    const group = await createGroup.execute({ organizationId: ORG_ID, code: "OPD", name: "Operação Direta" });
    return { categoryRepo, createCategory, group };
  }

  it("cria uma subcategoria associada ao grupo correcto", async () => {
    const { categoryRepo, createCategory, group } = await makeUseCases();

    const result = await createCategory.execute({
      organizationId: ORG_ID,
      groupId: group.id,
      code: "OPD.01",
      name: "CMV / Ingredientes",
      financialType: "cmv",
      affectsDre: true,
      affectsCashflow: true,
      affectsProfitability: true,
    });

    expect(result.code).toBe("OPD.01");
    expect(result.groupId).toBe(group.id);
    expect(result.financialType).toBe("cmv");
    expect(result.affectsDre).toBe(true);
    expect(result.isActive).toBe(true);
    expect(categoryRepo.getAll()).toHaveLength(1);
  });

  it("lança NotFound se o grupo não existe", async () => {
    const { createCategory } = await makeUseCases();

    await expect(
      createCategory.execute({
        organizationId: ORG_ID,
        groupId: "grupo-inexistente",
        code: "OPD.01",
        name: "CMV",
        financialType: "cmv",
        affectsDre: true,
        affectsCashflow: true,
        affectsProfitability: true,
      }),
    ).rejects.toThrow(CostCenterGroupNotFoundError);
  });

  it("lança erro se o código da categoria já existe", async () => {
    const { createCategory, group } = await makeUseCases();

    await createCategory.execute({
      organizationId: ORG_ID,
      groupId: group.id,
      code: "OPD.01",
      name: "CMV / Ingredientes",
      financialType: "cmv",
      affectsDre: true,
      affectsCashflow: true,
      affectsProfitability: true,
    });

    await expect(
      createCategory.execute({
        organizationId: ORG_ID,
        groupId: group.id,
        code: "OPD.01",
        name: "Duplicado",
        financialType: "cmv",
        affectsDre: true,
        affectsCashflow: true,
        affectsProfitability: true,
      }),
    ).rejects.toThrow(CostCenterCategoryCodeAlreadyExistsError);
  });
});
