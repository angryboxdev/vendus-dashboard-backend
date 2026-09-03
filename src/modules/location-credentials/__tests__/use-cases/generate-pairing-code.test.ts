import { GeneratePairingCodeUseCase } from "../../application/use-cases/generate-pairing-code.use-case.js";
import { FakePairingCodeRepository } from "../fakes/fake-pairing-code-repository.js";
import { FakeLocationRepository } from "../fakes/fake-location-repository.js";
import { Location } from "../../../locations/domain/entities/location.js";
import { LocationNotOwnedError } from "../../domain/errors.js";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";

const ORG_A = mintOrganizationId("org-a");
const ORG_B = mintOrganizationId("org-b");

function makeUseCase() {
  const pairingCodeRepository = new FakePairingCodeRepository();
  const locationRepository = new FakeLocationRepository();
  const useCase = new GeneratePairingCodeUseCase(pairingCodeRepository, locationRepository);
  return { pairingCodeRepository, locationRepository, useCase };
}

describe("GeneratePairingCodeUseCase", () => {
  it("generates a code scoped to the location once ownership is confirmed", async () => {
    const { pairingCodeRepository, locationRepository, useCase } = makeUseCase();
    locationRepository.seed(ORG_A, [
      Location.reconstitute({ id: "loc-1", name: "Store", code: "S1", timezone: "Europe/Lisbon", isActive: true }),
    ]);

    const result = await useCase.execute({ organizationId: ORG_A, locationId: "loc-1" });

    expect(result.code).toHaveLength(8);
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const saved = await pairingCodeRepository.findByCode(result.code);
    expect(saved).not.toBeNull();
    expect(saved!.organizationId).toBe(ORG_A);
    expect(saved!.locationId).toBe("loc-1");
    expect(saved!.isBurned).toBe(false);
  });

  it("rejects a location that does not belong to the calling organization", async () => {
    const { locationRepository, useCase } = makeUseCase();
    locationRepository.seed(ORG_B, [
      Location.reconstitute({ id: "loc-1", name: "Store", code: "S1", timezone: "Europe/Lisbon", isActive: true }),
    ]);

    await expect(useCase.execute({ organizationId: ORG_A, locationId: "loc-1" })).rejects.toThrow(
      LocationNotOwnedError,
    );
  });

  it("rejects a location id that does not exist at all", async () => {
    const { useCase } = makeUseCase();

    await expect(useCase.execute({ organizationId: ORG_A, locationId: "missing" })).rejects.toThrow(
      LocationNotOwnedError,
    );
  });
});
