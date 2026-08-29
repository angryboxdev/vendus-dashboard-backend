import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { GetOrganizationIdentityUseCase } from "../../application/use-cases/get-organization-identity.use-case.js";
import { FakeOrganizationIdentityRepository } from "../fakes/fake-organization-identity-repository.js";
import { OrganizationIdentity } from "../../domain/entities/organization-identity.js";
import { OrganizationNotFoundError } from "../../domain/errors.js";

describe("GetOrganizationIdentityUseCase", () => {
  it("devolve a identidade da organização pelo organizationId", async () => {
    const repo = new FakeOrganizationIdentityRepository();
    const organizationId = mintOrganizationId("b6999cff-79b2-4583-b8b4-a744b3ace748");
    const organization = OrganizationIdentity.reconstitute({
      id: organizationId,
      name: "Angrybox",
      nif: "518902609",
      address: "Rua António Paes, 41, 1º Esquerdo Posterior 4410-485 Arcozelo",
      email: "general@angrybox.pt",
    });
    repo.seed(organization);

    const useCase = new GetOrganizationIdentityUseCase(repo);
    const result = await useCase.execute({ organizationId });

    expect(result.name).toBe("Angrybox");
    expect(result.nif).toBe("518902609");
    expect(result.address).toBe("Rua António Paes, 41, 1º Esquerdo Posterior 4410-485 Arcozelo");
  });

  it("lança OrganizationNotFoundError se a organização não existe", async () => {
    const repo = new FakeOrganizationIdentityRepository();
    const useCase = new GetOrganizationIdentityUseCase(repo);

    await expect(
      useCase.execute({ organizationId: mintOrganizationId("nao-existe") }),
    ).rejects.toThrow(OrganizationNotFoundError);
  });
});
