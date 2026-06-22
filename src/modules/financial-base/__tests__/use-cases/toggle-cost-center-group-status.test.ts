import { CreateCostCenterGroupUseCase } from "../../application/use-cases/create-cost-center-group.use-case.js";
import { ToggleCostCenterGroupStatusUseCase } from "../../application/use-cases/toggle-cost-center-group-status.use-case.js";
import { FakeCostCenterGroupRepository } from "../fakes/fake-cost-center-group-repository.js";
import { CostCenterGroupNotFoundError } from "../../domain/errors.js";

describe("ToggleCostCenterGroupStatusUseCase", () => {
  async function makeUseCases() {
    const repo = new FakeCostCenterGroupRepository();
    const create = new CreateCostCenterGroupUseCase(repo);
    const toggle = new ToggleCostCenterGroupStatusUseCase(repo);
    const group = await create.execute({ code: "OPD", name: "Operação Direta" });
    return { toggle, group };
  }

  it("desactiva um grupo activo", async () => {
    const { toggle, group } = await makeUseCases();

    const result = await toggle.execute({ id: group.id, isActive: false });

    expect(result.isActive).toBe(false);
  });

  it("reactiva um grupo inactivo", async () => {
    const { toggle, group } = await makeUseCases();
    await toggle.execute({ id: group.id, isActive: false });

    const result = await toggle.execute({ id: group.id, isActive: true });

    expect(result.isActive).toBe(true);
  });

  it("lança NotFound para id inexistente", async () => {
    const { toggle } = await makeUseCases();

    await expect(toggle.execute({ id: "nao-existe", isActive: false })).rejects.toThrow(
      CostCenterGroupNotFoundError,
    );
  });
});
