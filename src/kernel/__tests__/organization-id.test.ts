import { mintOrganizationId, type OrganizationId } from "../organization-id.js";

describe("mintOrganizationId", () => {
  it("mints an OrganizationId from a non-empty string", () => {
    const orgId = mintOrganizationId("org-123");
    expect(orgId).toBe("org-123");
  });

  it("rejects an empty string", () => {
    expect(() => mintOrganizationId("")).toThrow(/cannot be empty/);
  });

  it("rejects a blank string", () => {
    expect(() => mintOrganizationId("   ")).toThrow(/cannot be empty/);
  });

  it("cannot be produced from a bare string without going through the mint function", () => {
    // Compile-time guarantee: a bare string is not assignable to OrganizationId.
    // @ts-expect-error — only mintOrganizationId may produce an OrganizationId.
    const bare: OrganizationId = "org-123";
    void bare;
  });
});
