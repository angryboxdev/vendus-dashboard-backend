import { SeedDefaultCostCentersUseCase } from "../../application/use-cases/seed-default-cost-centers.use-case.js";
import { FakeCostCenterGroupRepository } from "../fakes/fake-cost-center-group-repository.js";
import { FakeCostCenterCategoryRepository } from "../fakes/fake-cost-center-category-repository.js";
import { DEFAULT_COST_CENTERS } from "../../domain/seed/default-cost-centers.js";

describe("SeedDefaultCostCentersUseCase", () => {
  function makeUseCase() {
    const groupRepo = new FakeCostCenterGroupRepository();
    const categoryRepo = new FakeCostCenterCategoryRepository();
    const useCase = new SeedDefaultCostCentersUseCase(groupRepo, categoryRepo);
    return { groupRepo, categoryRepo, useCase };
  }

  const totalGroups = DEFAULT_COST_CENTERS.length;
  const totalCategories = DEFAULT_COST_CENTERS.reduce((s, g) => s + g.categories.length, 0);

  it("cria os 7 grupos e 28 subcategorias na primeira execução", async () => {
    const { groupRepo, categoryRepo, useCase } = makeUseCase();

    const result = await useCase.execute();

    expect(result.groupsCreated).toBe(totalGroups);
    expect(result.categoriesCreated).toBe(totalCategories);
    expect(result.groupsSkipped).toBe(0);
    expect(result.categoriesSkipped).toBe(0);
    expect(groupRepo.getAll()).toHaveLength(totalGroups);
    expect(categoryRepo.getAll()).toHaveLength(totalCategories);
  });

  it("é idempotente — segunda execução skip tudo", async () => {
    const { useCase } = makeUseCase();
    await useCase.execute();

    const result = await useCase.execute();

    expect(result.groupsCreated).toBe(0);
    expect(result.categoriesCreated).toBe(0);
    expect(result.groupsSkipped).toBe(totalGroups);
    expect(result.categoriesSkipped).toBe(totalCategories);
  });

  it("cria apenas o que falta se parte dos dados já existe", async () => {
    const { groupRepo, categoryRepo, useCase } = makeUseCase();
    // Primeira execução
    await useCase.execute();

    // Apaga manualmente um grupo e duas categorias do fake
    const groups = groupRepo.getAll();
    const firstGroup = groups[0]!;
    const firstGroupCategories = categoryRepo.getAll().filter((c) => c.groupId === firstGroup.id);

    // Recria repos sem o primeiro grupo e suas categorias
    const groupRepo2 = new FakeCostCenterGroupRepository();
    const categoryRepo2 = new FakeCostCenterCategoryRepository();
    for (const g of groups.slice(1)) await groupRepo2.save(g);
    for (const c of categoryRepo.getAll().filter((c) => c.groupId !== firstGroup.id)) {
      await categoryRepo2.save(c);
    }

    const useCase2 = new SeedDefaultCostCentersUseCase(groupRepo2, categoryRepo2);
    const result = await useCase2.execute();

    expect(result.groupsCreated).toBe(1);
    expect(result.categoriesCreated).toBe(firstGroupCategories.length);
  });

  it("cada subcategoria pertence ao grupo correcto (por código)", async () => {
    const { groupRepo, categoryRepo, useCase } = makeUseCase();
    await useCase.execute();

    for (const groupSeed of DEFAULT_COST_CENTERS) {
      const group = await groupRepo.findByCode(groupSeed.code);
      expect(group).not.toBeNull();

      const categories = await categoryRepo.findByGroupId(group!.id);
      expect(categories).toHaveLength(groupSeed.categories.length);

      for (const catSeed of groupSeed.categories) {
        const found = categories.find((c) => c.code === catSeed.code);
        expect(found).toBeDefined();
        expect(found!.financialType).toBe(catSeed.financialType);
        expect(found!.affectsDre).toBe(catSeed.affectsDre);
        expect(found!.affectsCashflow).toBe(catSeed.affectsCashflow);
      }
    }
  });
});
