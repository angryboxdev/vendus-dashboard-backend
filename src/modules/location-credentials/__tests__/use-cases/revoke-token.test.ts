import { RevokeTokenUseCase } from "../../application/use-cases/revoke-token.use-case.js";
import { FakeLocationTokenRepository } from "../fakes/fake-location-token-repository.js";
import { LocationToken } from "../../domain/entities/location-token.js";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";

const ORG_A = mintOrganizationId("org-a");
const ORG_B = mintOrganizationId("org-b");

describe("RevokeTokenUseCase", () => {
  it("deletes the given token", async () => {
    const repo = new FakeLocationTokenRepository();
    const token = LocationToken.create({ organizationId: ORG_A, locationId: "loc-1", tokenHash: "h1" });
    await repo.save(token);

    const useCase = new RevokeTokenUseCase(repo);
    await useCase.execute({ organizationId: ORG_A, tokenId: token.id });

    expect(repo.all()).toHaveLength(0);
  });

  it("revoking one token does not affect a sibling token at the same location", async () => {
    const repo = new FakeLocationTokenRepository();
    const tokenToRevoke = LocationToken.create({ organizationId: ORG_A, locationId: "loc-1", tokenHash: "h1" });
    const siblingToken = LocationToken.create({ organizationId: ORG_A, locationId: "loc-1", tokenHash: "h2" });
    await repo.save(tokenToRevoke);
    await repo.save(siblingToken);

    const useCase = new RevokeTokenUseCase(repo);
    await useCase.execute({ organizationId: ORG_A, tokenId: tokenToRevoke.id });

    const remaining = repo.all();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.id).toBe(siblingToken.id);
  });

  it("does not delete a token belonging to a different organization", async () => {
    const repo = new FakeLocationTokenRepository();
    const token = LocationToken.create({ organizationId: ORG_B, locationId: "loc-1", tokenHash: "h1" });
    await repo.save(token);

    const useCase = new RevokeTokenUseCase(repo);
    await useCase.execute({ organizationId: ORG_A, tokenId: token.id });

    expect(repo.all()).toHaveLength(1);
  });
});
