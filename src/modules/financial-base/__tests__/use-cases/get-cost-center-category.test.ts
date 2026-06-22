import { GetCostCenterCategoryUseCase } from "../../application/use-cases/get-cost-center-category.use-case.js";
import { FakeCostCenterCategoryRepository } from "../fakes/fake-cost-center-category-repository.js";
import { CostCenterCategory } from "../../domain/entities/cost-center-category.js";
import { CostCenterCategoryNotFoundError } from "../../domain/errors.js";

const GROUP_ID = "group-uuid-123";

function makeCategory(code: string) {
  return CostCenterCategory.create({
    groupId: GROUP_ID,
    code,
    name: `Categoria ${code}`,
    financialType: "cmv",
    affectsDre: true,
    affectsCashflow: true,
    affectsProfitability: true,
  });
}

describe("GetCostCenterCategoryUseCase", () => {
  it("devolve a categoria pelo id", async () => {
    const repo = new FakeCostCenterCategoryRepository();
    const cat = makeCategory("OPD.01");
    await repo.save(cat);

    const useCase = new GetCostCenterCategoryUseCase(repo);
    const result = await useCase.execute({ id: cat.id });

    expect(result.id).toBe(cat.id);
    expect(result.code).toBe("OPD.01");
    expect(result.groupId).toBe(GROUP_ID);
  });

  it("lança CostCenterCategoryNotFoundError se o id não existe", async () => {
    const repo = new FakeCostCenterCategoryRepository();
    const useCase = new GetCostCenterCategoryUseCase(repo);

    await expect(useCase.execute({ id: "nao-existe" })).rejects.toThrow(CostCenterCategoryNotFoundError);
  });
});
