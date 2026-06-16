import { CreateCostCenterUseCase } from "../../application/use-cases/create-cost-center.use-case.js";
import { UpdateCostCenterUseCase } from "../../application/use-cases/update-cost-center.use-case.js";
import { FakeCostCenterRepository } from "../fakes/fake-cost-center-repository.js";
import { CostCenterNotFoundError } from "../../domain/errors.js";

describe("UpdateCostCenterUseCase", () => {
  let repo: FakeCostCenterRepository;
  let create: CreateCostCenterUseCase;
  let update: UpdateCostCenterUseCase;

  beforeEach(() => {
    repo = new FakeCostCenterRepository();
    create = new CreateCostCenterUseCase(repo);
    update = new UpdateCostCenterUseCase(repo);
  });

  it("actualiza o nome de um centro de custo existente", async () => {
    const created = await create.execute({
      code: "MKT",
      name: "Marketing",
      category: "marketing",
    });

    const updated = await update.execute({
      id: created.id,
      data: { name: "Marketing Digital" },
    });

    expect(updated.name).toBe("Marketing Digital");
    expect(updated.category).toBe("marketing");
  });

  it("lança erro para id inexistente", async () => {
    await expect(
      update.execute({ id: "nao-existe", data: { name: "X" } }),
    ).rejects.toThrow(CostCenterNotFoundError);
  });
});
