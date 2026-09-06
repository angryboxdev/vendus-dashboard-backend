import { ListActiveTokensUseCase } from "../../application/use-cases/list-active-tokens.use-case.js";
import { FakeLocationTokenRepository } from "../fakes/fake-location-token-repository.js";
import { FakeLocationRepository } from "../fakes/fake-location-repository.js";
import { LocationToken } from "../../domain/entities/location-token.js";
import { Location } from "../../../locations/domain/entities/location.js";
import { LocationNotOwnedError } from "../../domain/errors.js";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";

const ORG_A = mintOrganizationId("org-a");
const ORG_B = mintOrganizationId("org-b");

function buildLocation(id: string, name: string): Location {
  return Location.reconstitute({ id, name, code: id, timezone: "Europe/Lisbon", isActive: true });
}

describe("ListActiveTokensUseCase", () => {
  it("returns issue dates and the location's name for the given location", async () => {
    const tokenRepo = new FakeLocationTokenRepository();
    const locationRepo = new FakeLocationRepository();
    locationRepo.seed(ORG_A, [buildLocation("loc-1", "Downtown")]);
    const token = LocationToken.create({ organizationId: ORG_A, locationId: "loc-1", tokenHash: "h1" });
    await tokenRepo.save(token);

    const useCase = new ListActiveTokensUseCase(tokenRepo, locationRepo);
    const result = await useCase.execute({ organizationId: ORG_A, locationId: "loc-1" });

    expect(result).toEqual([
      { id: token.id, issuedAt: token.issuedAt, locationName: "Downtown", description: null },
    ]);
  });

  it("includes the token's description when it was set", async () => {
    const tokenRepo = new FakeLocationTokenRepository();
    const locationRepo = new FakeLocationRepository();
    locationRepo.seed(ORG_A, [buildLocation("loc-1", "Downtown")]);
    const token = LocationToken.create({
      organizationId: ORG_A,
      locationId: "loc-1",
      tokenHash: "h1",
      description: "Kitchen monitor",
    });
    await tokenRepo.save(token);

    const useCase = new ListActiveTokensUseCase(tokenRepo, locationRepo);
    const result = await useCase.execute({ organizationId: ORG_A, locationId: "loc-1" });

    expect(result[0]!.description).toBe("Kitchen monitor");
  });

  it("does not return tokens from another organization or another location", async () => {
    const tokenRepo = new FakeLocationTokenRepository();
    const locationRepo = new FakeLocationRepository();
    locationRepo.seed(ORG_A, [buildLocation("loc-1", "Downtown"), buildLocation("loc-2", "Uptown")]);
    locationRepo.seed(ORG_B, [buildLocation("loc-1", "Other Org's Downtown")]);
    await tokenRepo.save(LocationToken.create({ organizationId: ORG_A, locationId: "loc-1", tokenHash: "h1" }));
    await tokenRepo.save(LocationToken.create({ organizationId: ORG_A, locationId: "loc-2", tokenHash: "h2" }));
    await tokenRepo.save(LocationToken.create({ organizationId: ORG_B, locationId: "loc-1", tokenHash: "h3" }));

    const useCase = new ListActiveTokensUseCase(tokenRepo, locationRepo);
    const result = await useCase.execute({ organizationId: ORG_A, locationId: "loc-1" });

    expect(result).toHaveLength(1);
  });

  it("throws LocationNotOwnedError when the location doesn't belong to the calling organization", async () => {
    const tokenRepo = new FakeLocationTokenRepository();
    const locationRepo = new FakeLocationRepository();

    const useCase = new ListActiveTokensUseCase(tokenRepo, locationRepo);

    await expect(useCase.execute({ organizationId: ORG_A, locationId: "loc-1" })).rejects.toThrow(
      LocationNotOwnedError,
    );
  });
});
