import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { ResolveVendusBootConfigUseCase } from "../../application/use-cases/resolve-vendus-boot-config.use-case.js";
import { FakeVendusCredentials } from "../fakes/fake-vendus-credentials.js";
import { FakeVendusLocationConfig } from "../fakes/fake-vendus-location-config.js";

const ORG_ID = mintOrganizationId("11111111-1111-1111-1111-111111111111");
const LOCATION_ID = "22222222-2222-2222-2222-222222222222";

function buildUseCase() {
  const credentials = new FakeVendusCredentials();
  const locationConfig = new FakeVendusLocationConfig();
  const useCase = new ResolveVendusBootConfigUseCase(credentials, locationConfig);
  return { useCase, credentials, locationConfig };
}

describe("ResolveVendusBootConfigUseCase", () => {
  it("resolves the api key and location config for a fully-configured organization", async () => {
    const { useCase, credentials, locationConfig } = buildUseCase();
    credentials.seed(ORG_ID, { apiKey: "secret-key" });
    locationConfig.seed(ORG_ID, LOCATION_ID, {
      registerId: "reg-1",
      eatzPaymentId: 111,
      appsPaymentId: 222,
      salaoPriceGroupId: 333,
      eatzPriceGroupId: 444,
    });

    const result = await useCase.execute({ organizationId: ORG_ID, locationId: LOCATION_ID });

    expect(result).toEqual({
      apiKey: "secret-key",
      registerId: "reg-1",
      eatzPaymentId: 111,
      appsPaymentId: 222,
      salaoPriceGroupId: 333,
      eatzPriceGroupId: 444,
    });
  });

  it("throws when the organization has no Vendus credentials configured", async () => {
    const { useCase, locationConfig } = buildUseCase();
    locationConfig.seed(ORG_ID, LOCATION_ID, {
      registerId: "reg-1",
      eatzPaymentId: 111,
      appsPaymentId: 222,
      salaoPriceGroupId: 333,
      eatzPriceGroupId: 444,
    });

    await expect(useCase.execute({ organizationId: ORG_ID, locationId: LOCATION_ID })).rejects.toThrow(
      /credentials not configured/,
    );
  });

  it("throws when the location has no Vendus config configured", async () => {
    const { useCase, credentials } = buildUseCase();
    credentials.seed(ORG_ID, { apiKey: "secret-key" });

    await expect(useCase.execute({ organizationId: ORG_ID, locationId: LOCATION_ID })).rejects.toThrow(
      /location config not configured/,
    );
  });
});
