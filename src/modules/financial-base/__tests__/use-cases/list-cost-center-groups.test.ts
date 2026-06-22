import { ListCostCenterGroupsUseCase } from "../../application/use-cases/list-cost-center-groups.use-case.js";
import { FakeCostCenterGroupRepository } from "../fakes/fake-cost-center-group-repository.js";
import { CostCenterGroup } from "../../domain/entities/cost-center-group.js";

async function makeRepo() {
  const repo = new FakeCostCenterGroupRepository();
  const active1 = CostCenterGroup.create({ code: "OPD", name: "Operação Direta", sortOrder: 1 });
  const active2 = CostCenterGroup.create({ code: "PES", name: "Pessoal", sortOrder: 2 });
  const inactive = CostCenterGroup.create({ code: "ADM", name: "Administrativo", sortOrder: 3 }).deactivate();
  await repo.save(active1);
  await repo.save(active2);
  await repo.save(inactive);
  return repo;
}

describe("ListCostCenterGroupsUseCase", () => {
  it("devolve todos os grupos sem filtro", async () => {
    const repo = await makeRepo();
    const useCase = new ListCostCenterGroupsUseCase(repo);

    const result = await useCase.execute();

    expect(result).toHaveLength(3);
  });

  it("filtra apenas grupos ativos", async () => {
    const repo = await makeRepo();
    const useCase = new ListCostCenterGroupsUseCase(repo);

    const result = await useCase.execute({ isActive: true });

    expect(result).toHaveLength(2);
    expect(result.every((g) => g.isActive)).toBe(true);
  });

  it("filtra apenas grupos inativos", async () => {
    const repo = await makeRepo();
    const useCase = new ListCostCenterGroupsUseCase(repo);

    const result = await useCase.execute({ isActive: false });

    expect(result).toHaveLength(1);
    expect(result[0].code).toBe("ADM");
  });

  it("devolve lista vazia quando não há grupos", async () => {
    const repo = new FakeCostCenterGroupRepository();
    const useCase = new ListCostCenterGroupsUseCase(repo);

    const result = await useCase.execute();

    expect(result).toEqual([]);
  });
});
