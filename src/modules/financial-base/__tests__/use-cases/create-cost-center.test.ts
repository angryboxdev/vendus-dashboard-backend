import { CreateCostCenterUseCase } from "../../application/use-cases/create-cost-center.use-case.js";
import { FakeCostCenterRepository } from "../fakes/fake-cost-center-repository.js";
import { CostCenterCodeAlreadyExistsError } from "../../domain/errors.js";

describe("CreateCostCenterUseCase", () => {
  let repo: FakeCostCenterRepository;
  let useCase: CreateCostCenterUseCase;

  beforeEach(() => {
    repo = new FakeCostCenterRepository();
    useCase = new CreateCostCenterUseCase(repo);
  });

  it("cria um centro de custo e persiste-o", async () => {
    const result = await useCase.execute({
      code: "adm",
      name: "Administração",
      category: "administration",
    });

    expect(result.id).toBeDefined();
    expect(result.code).toBe("ADM");
    expect(result.name).toBe("Administração");
    expect(result.status).toBe("active");

    const saved = await repo.findById(result.id);
    expect(saved).not.toBeNull();
  });

  it("lança erro se o código já existe", async () => {
    await useCase.execute({ code: "ADM", name: "Administração", category: "administration" });

    await expect(
      useCase.execute({ code: "adm", name: "Outro", category: "operations" }),
    ).rejects.toThrow(CostCenterCodeAlreadyExistsError);
  });
});
