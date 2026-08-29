import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { ListCostCenterCategoriesUseCase } from "../../application/use-cases/list-cost-center-categories.use-case.js";
import { FakeCostCenterCategoryRepository } from "../fakes/fake-cost-center-category-repository.js";
import { CostCenterCategory } from "../../domain/entities/cost-center-category.js";

const ORG_ID = mintOrganizationId("org-test");
const GROUP_A = "group-a-uuid";
const GROUP_B = "group-b-uuid";

function makeCategory(code: string, groupId: string, active = true) {
  const cat = CostCenterCategory.create({
    groupId,
    code,
    name: `Categoria ${code}`,
    financialType: "cmv",
    affectsDre: true,
    affectsCashflow: true,
    affectsProfitability: true,
  });
  return active ? cat : cat.deactivate();
}

async function makeRepo() {
  const repo = new FakeCostCenterCategoryRepository();
  await repo.save(ORG_ID, makeCategory("OPD.01", GROUP_A));
  await repo.save(ORG_ID, makeCategory("OPD.02", GROUP_A));
  await repo.save(ORG_ID, makeCategory("PES.01", GROUP_B));
  await repo.save(ORG_ID, makeCategory("PES.02", GROUP_B, false)); // inativa
  return repo;
}

describe("ListCostCenterCategoriesUseCase", () => {
  it("devolve todas as categorias sem filtro", async () => {
    const repo = await makeRepo();
    const useCase = new ListCostCenterCategoriesUseCase(repo);

    const result = await useCase.execute({ organizationId: ORG_ID });

    expect(result).toHaveLength(4);
  });

  it("filtra por groupId", async () => {
    const repo = await makeRepo();
    const useCase = new ListCostCenterCategoriesUseCase(repo);

    const result = await useCase.execute({ organizationId: ORG_ID, groupId: GROUP_A });

    expect(result).toHaveLength(2);
    expect(result.every((c) => c.groupId === GROUP_A)).toBe(true);
  });

  it("filtra apenas categorias ativas", async () => {
    const repo = await makeRepo();
    const useCase = new ListCostCenterCategoriesUseCase(repo);

    const result = await useCase.execute({ organizationId: ORG_ID, isActive: true });

    expect(result).toHaveLength(3);
    expect(result.every((c) => c.isActive)).toBe(true);
  });

  it("filtra apenas categorias inativas", async () => {
    const repo = await makeRepo();
    const useCase = new ListCostCenterCategoriesUseCase(repo);

    const result = await useCase.execute({ organizationId: ORG_ID, isActive: false });

    expect(result).toHaveLength(1);
    expect(result[0].code).toBe("PES.02");
  });

  it("combina filtros groupId e isActive", async () => {
    const repo = await makeRepo();
    const useCase = new ListCostCenterCategoriesUseCase(repo);

    const result = await useCase.execute({ organizationId: ORG_ID, groupId: GROUP_B, isActive: true });

    expect(result).toHaveLength(1);
    expect(result[0].code).toBe("PES.01");
  });

  it("devolve lista vazia quando não há categorias", async () => {
    const repo = new FakeCostCenterCategoryRepository();
    const useCase = new ListCostCenterCategoriesUseCase(repo);

    const result = await useCase.execute({ organizationId: ORG_ID });

    expect(result).toEqual([]);
  });
});
