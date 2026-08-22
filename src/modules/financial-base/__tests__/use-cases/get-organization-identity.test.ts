import { GetOrganizationIdentityUseCase } from "../../application/use-cases/get-organization-identity.use-case.js";
import { FakeOrganizationIdentityRepository } from "../fakes/fake-organization-identity-repository.js";
import { OrganizationIdentity } from "../../domain/entities/organization-identity.js";
import { OrganizationNotFoundError } from "../../domain/errors.js";

describe("GetOrganizationIdentityUseCase", () => {
  it("devolve a identidade da organização pelo orgId", async () => {
    const repo = new FakeOrganizationIdentityRepository();
    const organization = OrganizationIdentity.reconstitute({
      id: "b6999cff-79b2-4583-b8b4-a744b3ace748",
      name: "Angrybox",
      nif: "518902609",
      address: "Rua António Paes, 41, 1º Esquerdo Posterior 4410-485 Arcozelo",
      email: "general@angrybox.pt",
    });
    repo.seed(organization);

    const useCase = new GetOrganizationIdentityUseCase(repo);
    const result = await useCase.execute({ orgId: organization.id });

    expect(result.name).toBe("Angrybox");
    expect(result.nif).toBe("518902609");
    expect(result.address).toBe("Rua António Paes, 41, 1º Esquerdo Posterior 4410-485 Arcozelo");
  });

  it("lança OrganizationNotFoundError se o orgId não existe", async () => {
    const repo = new FakeOrganizationIdentityRepository();
    const useCase = new GetOrganizationIdentityUseCase(repo);

    await expect(useCase.execute({ orgId: "nao-existe" })).rejects.toThrow(
      OrganizationNotFoundError,
    );
  });
});
