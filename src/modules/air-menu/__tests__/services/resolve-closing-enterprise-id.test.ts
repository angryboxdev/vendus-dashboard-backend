import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { resolveClosingEnterpriseId } from "../../domain/services/resolve-closing-enterprise-id.js";
import { FakeAirMenuCredentialsPort } from "../fakes/fake-air-menu-credentials-port.js";
import { FakeAirMenuLocationConfigPort } from "../fakes/fake-air-menu-location-config-port.js";

const ORG_ID = mintOrganizationId("11111111-1111-1111-1111-111111111111");
const LOCATION_ID = "22222222-2222-2222-2222-222222222222";

describe("AirMenuCredentialsPort contract (fake)", () => {
  it("reports not_configured when no credentials were seeded", async () => {
    const port = new FakeAirMenuCredentialsPort();
    expect(await port.getByOrganization(ORG_ID)).toEqual({ status: "not_configured" });
  });

  it("reports found with the seeded credentials", async () => {
    const port = new FakeAirMenuCredentialsPort();
    const credentials = { apiKey: "key", username: "user", password: "pass" };
    port.seed(ORG_ID, credentials);

    expect(await port.getByOrganization(ORG_ID)).toEqual({ status: "found", credentials });
  });
});

describe("resolveClosingEnterpriseId", () => {
  it("returns null when the location config port reports not_configured", async () => {
    const port = new FakeAirMenuLocationConfigPort();
    const result = await port.getByLocation(ORG_ID, LOCATION_ID);

    expect(resolveClosingEnterpriseId(result)).toBeNull();
  });

  it("returns the closing enterprise id when the location config port reports found", async () => {
    const port = new FakeAirMenuLocationConfigPort();
    port.seed(ORG_ID, LOCATION_ID, { closingEnterpriseId: "ent-123" });
    const result = await port.getByLocation(ORG_ID, LOCATION_ID);

    expect(resolveClosingEnterpriseId(result)).toBe("ent-123");
  });
});
