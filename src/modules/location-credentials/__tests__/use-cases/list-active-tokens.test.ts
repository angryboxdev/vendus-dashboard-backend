import { ListActiveTokensUseCase } from "../../application/use-cases/list-active-tokens.use-case.js";
import { FakeLocationTokenRepository } from "../fakes/fake-location-token-repository.js";
import { LocationToken } from "../../domain/entities/location-token.js";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";

const ORG_A = mintOrganizationId("org-a");
const ORG_B = mintOrganizationId("org-b");

describe("ListActiveTokensUseCase", () => {
  it("returns issue dates only for the given location, no other identifying data", async () => {
    const repo = new FakeLocationTokenRepository();
    const token = LocationToken.create({ organizationId: ORG_A, locationId: "loc-1", tokenHash: "h1" });
    await repo.save(token);

    const useCase = new ListActiveTokensUseCase(repo);
    const result = await useCase.execute({ organizationId: ORG_A, locationId: "loc-1" });

    expect(result).toEqual([{ id: token.id, issuedAt: token.issuedAt }]);
  });

  it("does not return tokens from another organization or another location", async () => {
    const repo = new FakeLocationTokenRepository();
    await repo.save(LocationToken.create({ organizationId: ORG_A, locationId: "loc-1", tokenHash: "h1" }));
    await repo.save(LocationToken.create({ organizationId: ORG_A, locationId: "loc-2", tokenHash: "h2" }));
    await repo.save(LocationToken.create({ organizationId: ORG_B, locationId: "loc-1", tokenHash: "h3" }));

    const useCase = new ListActiveTokensUseCase(repo);
    const result = await useCase.execute({ organizationId: ORG_A, locationId: "loc-1" });

    expect(result).toHaveLength(1);
  });
});
