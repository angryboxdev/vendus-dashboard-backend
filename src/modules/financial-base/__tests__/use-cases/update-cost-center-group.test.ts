import { CreateCostCenterGroupUseCase } from "../../application/use-cases/create-cost-center-group.use-case.js";
import { UpdateCostCenterGroupUseCase } from "../../application/use-cases/update-cost-center-group.use-case.js";
import { FakeCostCenterGroupRepository } from "../fakes/fake-cost-center-group-repository.js";
import { CostCenterGroupNotFoundError } from "../../domain/errors.js";

describe("UpdateCostCenterGroupUseCase", () => {
  async function makeUseCases() {
    const repo = new FakeCostCenterGroupRepository();
    const create = new CreateCostCenterGroupUseCase(repo);
    const update = new UpdateCostCenterGroupUseCase(repo);
    const group = await create.execute({ code: "OPD", name: "Operação", sortOrder: 1 });
    return { repo, update, group };
  }

  it("actualiza o nome do grupo", async () => {
    const { update, group } = await makeUseCases();

    const result = await update.execute({ id: group.id, data: { name: "Operação Direta" } });

    expect(result.name).toBe("Operação Direta");
    expect(result.code).toBe("OPD");
  });

  it("actualiza sortOrder e description", async () => {
    const { update, group } = await makeUseCases();

    const result = await update.execute({
      id: group.id,
      data: { sortOrder: 5, description: "Custos de produção" },
    });

    expect(result.sortOrder).toBe(5);
    expect(result.description).toBe("Custos de produção");
  });

  it("lança NotFound se o grupo não existe", async () => {
    const { update } = await makeUseCases();

    await expect(
      update.execute({ id: "nao-existe", data: { name: "X" } }),
    ).rejects.toThrow(CostCenterGroupNotFoundError);
  });
});
