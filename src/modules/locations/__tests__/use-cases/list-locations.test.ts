import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { Location } from "../../domain/entities/location.js";
import { ListLocationsUseCase } from "../../application/use-cases/list-locations.use-case.js";
import { FakeLocationRepository } from "../fakes/fake-location-repository.js";

describe("ListLocationsUseCase", () => {
  it("returns only the given organization's locations", async () => {
    const repo = new FakeLocationRepository();
    const orgA = mintOrganizationId("org-a");
    const orgB = mintOrganizationId("org-b");
    repo.seed(orgA, [
      Location.reconstitute({ id: "loc-1", name: "Arcozelo", code: "ARC", timezone: "Europe/Lisbon", isActive: true }),
    ]);
    repo.seed(orgB, [
      Location.reconstitute({ id: "loc-2", name: "Other Org Store", code: "OOS", timezone: "Europe/Lisbon", isActive: true }),
    ]);

    const useCase = new ListLocationsUseCase(repo);
    const result = await useCase.execute({ organizationId: orgA });

    expect(result).toEqual([
      { id: "loc-1", name: "Arcozelo", code: "ARC", timezone: "Europe/Lisbon", isActive: true },
    ]);
  });

  it("returns an empty list for an organization with no locations", async () => {
    const repo = new FakeLocationRepository();
    const useCase = new ListLocationsUseCase(repo);

    const result = await useCase.execute({ organizationId: mintOrganizationId("org-with-no-locations") });

    expect(result).toEqual([]);
  });
});
