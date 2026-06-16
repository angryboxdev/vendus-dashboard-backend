import { CreateCostCenterUseCase } from "../../application/use-cases/create-cost-center.use-case.js";
import { ToggleCostCenterStatusUseCase } from "../../application/use-cases/toggle-cost-center-status.use-case.js";
import { FakeCostCenterRepository } from "../fakes/fake-cost-center-repository.js";
import { CostCenterNotFoundError } from "../../domain/errors.js";

describe("ToggleCostCenterStatusUseCase", () => {
  let repo: FakeCostCenterRepository;
  let create: CreateCostCenterUseCase;
  let toggle: ToggleCostCenterStatusUseCase;

  beforeEach(() => {
    repo = new FakeCostCenterRepository();
    create = new CreateCostCenterUseCase(repo);
    toggle = new ToggleCostCenterStatusUseCase(repo);
  });

  it("desactiva um centro de custo activo", async () => {
    const created = await create.execute({ code: "ADM", name: "Administração", category: "administration" });
    const result = await toggle.execute({ id: created.id, status: "inactive" });
    expect(result.status).toBe("inactive");
  });

  it("reactiva um centro de custo inactivo", async () => {
    const created = await create.execute({ code: "ADM", name: "Administração", category: "administration" });
    await toggle.execute({ id: created.id, status: "inactive" });
    const result = await toggle.execute({ id: created.id, status: "active" });
    expect(result.status).toBe("active");
  });

  it("lança erro para id inexistente", async () => {
    await expect(
      toggle.execute({ id: "nao-existe", status: "inactive" }),
    ).rejects.toThrow(CostCenterNotFoundError);
  });
});
