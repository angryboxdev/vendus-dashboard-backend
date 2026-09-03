import { LocationToken } from "../../domain/entities/location-token.js";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";

const ORG_A = mintOrganizationId("org-a");

describe("LocationToken entity", () => {
  it("creates a token scoped to the given organization and location", () => {
    const token = LocationToken.create({
      organizationId: ORG_A,
      locationId: "loc-1",
      tokenHash: "hash-value",
    });

    expect(token.id).toBeDefined();
    expect(token.organizationId).toBe(ORG_A);
    expect(token.locationId).toBe("loc-1");
    expect(token.tokenHash).toBe("hash-value");
    expect(token.issuedAt).toBeInstanceOf(Date);
  });

  it("reconstitutes from persisted data", () => {
    const issuedAt = new Date("2026-01-01T00:00:00Z");
    const token = LocationToken.reconstitute({
      id: "token-1",
      organizationId: ORG_A,
      locationId: "loc-1",
      tokenHash: "hash-value",
      issuedAt,
    });

    expect(token.id).toBe("token-1");
    expect(token.issuedAt).toBe(issuedAt);
  });
});
