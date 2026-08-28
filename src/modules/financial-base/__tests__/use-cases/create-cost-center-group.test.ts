import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { CreateCostCenterGroupUseCase } from "../../application/use-cases/create-cost-center-group.use-case.js";
import { FakeCostCenterGroupRepository } from "../fakes/fake-cost-center-group-repository.js";
import { CostCenterGroupCodeAlreadyExistsError } from "../../domain/errors.js";

const ORG_ID = mintOrganizationId("org-test");

describe("CreateCostCenterGroupUseCase", () => {
  function makeUseCase() {
    const repo = new FakeCostCenterGroupRepository();
    const useCase = new CreateCostCenterGroupUseCase(repo);
    return { repo, useCase };
  }

  it("cria e persiste um grupo", async () => {
    const { repo, useCase } = makeUseCase();

    const result = await useCase.execute({
      organizationId: ORG_ID,
      code: "OPD",
      name: "Operação Direta",
      sortOrder: 1,
    });

    expect(result.code).toBe("OPD");
    expect(result.name).toBe("Operação Direta");
    expect(result.isActive).toBe(true);
    expect(repo.getAll()).toHaveLength(1);
  });

  it("normaliza o código para maiúsculas", async () => {
    const { useCase } = makeUseCase();
    const result = await useCase.execute({ organizationId: ORG_ID, code: "pes", name: "Pessoal" });
    expect(result.code).toBe("PES");
  });

  it("lança erro se o código já existe", async () => {
    const { useCase } = makeUseCase();
    await useCase.execute({ organizationId: ORG_ID, code: "OPD", name: "Operação Direta" });

    await expect(
      useCase.execute({ organizationId: ORG_ID, code: "OPD", name: "Outra" }),
    ).rejects.toThrow(CostCenterGroupCodeAlreadyExistsError);
  });

  it("lança erro mesmo com código em minúsculas duplicado", async () => {
    const { useCase } = makeUseCase();
    await useCase.execute({ organizationId: ORG_ID, code: "OPD", name: "Operação Direta" });

    await expect(
      useCase.execute({ organizationId: ORG_ID, code: "opd", name: "Outra" }),
    ).rejects.toThrow(CostCenterGroupCodeAlreadyExistsError);
  });
});
