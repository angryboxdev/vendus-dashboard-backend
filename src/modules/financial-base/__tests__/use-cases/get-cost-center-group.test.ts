import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { GetCostCenterGroupUseCase } from "../../application/use-cases/get-cost-center-group.use-case.js";
import { FakeCostCenterGroupRepository } from "../fakes/fake-cost-center-group-repository.js";
import { CostCenterGroup } from "../../domain/entities/cost-center-group.js";
import { CostCenterGroupNotFoundError } from "../../domain/errors.js";

const ORG_ID = mintOrganizationId("org-test");

function makeGroup(code: string) {
  return CostCenterGroup.create({ code, name: `Grupo ${code}` });
}

describe("GetCostCenterGroupUseCase", () => {
  it("devolve o grupo pelo id", async () => {
    const repo = new FakeCostCenterGroupRepository();
    const group = makeGroup("OPD");
    await repo.save(ORG_ID, group);

    const useCase = new GetCostCenterGroupUseCase(repo);
    const result = await useCase.execute({ organizationId: ORG_ID, id: group.id });

    expect(result.id).toBe(group.id);
    expect(result.code).toBe("OPD");
  });

  it("lança CostCenterGroupNotFoundError se o id não existe", async () => {
    const repo = new FakeCostCenterGroupRepository();
    const useCase = new GetCostCenterGroupUseCase(repo);

    await expect(useCase.execute({ organizationId: ORG_ID, id: "nao-existe" })).rejects.toThrow(
      CostCenterGroupNotFoundError,
    );
  });
});
