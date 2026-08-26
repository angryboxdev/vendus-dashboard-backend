import {
  provisionOrganization,
  DuplicateOrganizationNifError,
  type ProvisionOrganizationDeps,
  type ProvisionOrganizationInput,
  type ProvisionedAdminUser,
  type ProvisionedLocation,
  type ProvisionedMembership,
  type ProvisionedOrganization,
} from "../organizationProvisioningService.js";

/**
 * In-memory fake standing in for the real Supabase-backed deps. Records every
 * call so tests can assert both outcome and call counts/order (the
 * correctness properties this ticket cares about: at most one membership,
 * rollback happening, rollback happening in the right order).
 */
function makeFakeDeps(overrides?: Partial<ProvisionOrganizationDeps>) {
  const calls: string[] = [];
  const organizations = new Map<string, ProvisionedOrganization>();
  const locations = new Map<string, ProvisionedLocation>();
  const authUsers = new Map<string, ProvisionedAdminUser>();
  const memberships: ProvisionedMembership[] = [];
  const existingNifs = new Set<string>();
  let nextId = 1;

  const base: ProvisionOrganizationDeps = {
    async createOrganization(input) {
      if (existingNifs.has(input.nif)) {
        throw new DuplicateOrganizationNifError(input.nif);
      }
      const org: ProvisionedOrganization = {
        id: `org-${nextId++}`,
        name: input.name,
        nif: input.nif,
      };
      organizations.set(org.id, org);
      existingNifs.add(input.nif);
      return org;
    },
    async createLocation(input) {
      const loc: ProvisionedLocation = {
        id: `loc-${nextId++}`,
        orgId: input.orgId,
        name: input.name,
        code: input.code,
      };
      locations.set(loc.id, loc);
      return loc;
    },
    async createAdminAuthUser(input) {
      const user: ProvisionedAdminUser = { id: `user-${nextId++}`, email: input.email };
      authUsers.set(user.id, user);
      return user;
    },
    async createMembership(input) {
      const membership: ProvisionedMembership = {
        orgId: input.orgId,
        userId: input.userId,
        role: "admin",
      };
      memberships.push(membership);
      return membership;
    },
    async deleteOrganization(orgId) {
      organizations.delete(orgId);
    },
    async deleteLocation(locationId) {
      locations.delete(locationId);
    },
    async deleteAuthUser(userId) {
      authUsers.delete(userId);
    },
  };

  // Every step is wrapped so `calls` always records what was invoked, even
  // when a test overrides a step's behaviour (e.g. to make it throw).
  const merged = { ...base, ...overrides };
  const deps = Object.fromEntries(
    Object.entries(merged).map(([key, fn]) => [
      key,
      async (...args: unknown[]) => {
        calls.push(key);
        // @ts-expect-error -- generic passthrough wrapper over a heterogeneous deps map
        return fn(...args);
      },
    ]),
  ) as unknown as ProvisionOrganizationDeps;

  return { deps, calls, organizations, locations, authUsers, memberships, existingNifs };
}

function makeInput(overrides?: Partial<ProvisionOrganizationInput>): ProvisionOrganizationInput {
  return {
    orgName: "Acme Restaurants",
    orgNif: "999888777",
    orgAddress: "Rua Exemplo, 1",
    orgEmail: "ops@acme.example",
    locationName: "Main",
    locationCode: "MAIN",
    adminEmail: "admin@acme.example",
    adminPassword: "correct-horse-battery-staple",
    ...overrides,
  };
}

describe("provisionOrganization", () => {
  it("creates the organization, its location, the admin user and exactly one admin membership, in order", async () => {
    const { deps, calls, memberships } = makeFakeDeps();

    const result = await provisionOrganization(makeInput(), deps);

    expect(calls).toEqual([
      "createOrganization",
      "createLocation",
      "createAdminAuthUser",
      "createMembership",
    ]);
    expect(memberships).toHaveLength(1);
    expect(memberships[0]).toEqual({
      orgId: result.organization.id,
      userId: result.adminUser.id,
      role: "admin",
    });
    expect(result.location.orgId).toBe(result.organization.id);
    expect(result.membership).toEqual(memberships[0]);
  });

  it("defaults the location timezone to Europe/Lisbon when not provided", async () => {
    const receivedTimezones: string[] = [];
    const { deps } = makeFakeDeps({
      async createLocation(input) {
        receivedTimezones.push(input.timezone);
        return { id: "loc-1", orgId: input.orgId, name: input.name, code: input.code };
      },
    });

    await provisionOrganization(makeInput(), deps);

    expect(receivedTimezones).toEqual(["Europe/Lisbon"]);
  });

  it("passes through an explicit location timezone", async () => {
    const receivedTimezones: string[] = [];
    const { deps } = makeFakeDeps({
      async createLocation(input) {
        receivedTimezones.push(input.timezone);
        return { id: "loc-1", orgId: input.orgId, name: input.name, code: input.code };
      },
    });

    await provisionOrganization(makeInput({ locationTimezone: "Atlantic/Azores" }), deps);

    expect(receivedTimezones).toEqual(["Atlantic/Azores"]);
  });

  it("refuses a duplicate nif before creating anything else, and performs no rollback", async () => {
    const { deps, calls, existingNifs } = makeFakeDeps();
    existingNifs.add("999888777");

    await expect(provisionOrganization(makeInput(), deps)).rejects.toBeInstanceOf(
      DuplicateOrganizationNifError,
    );

    // Only the organization insert was attempted — nothing downstream, and
    // nothing to roll back because nothing else was created.
    expect(calls).toEqual(["createOrganization"]);
  });

  it("rolls back the organization if creating the location fails", async () => {
    const { deps, calls } = makeFakeDeps({
      async createLocation() {
        throw new Error("locations.code unique violation");
      },
    });

    await expect(provisionOrganization(makeInput(), deps)).rejects.toThrow(
      "locations.code unique violation",
    );

    expect(calls).toEqual(["createOrganization", "createLocation", "deleteOrganization"]);
  });

  it("rolls back the location then the organization if creating the admin user fails", async () => {
    const { deps, calls } = makeFakeDeps({
      async createAdminAuthUser() {
        throw new Error("email already registered");
      },
    });

    await expect(provisionOrganization(makeInput(), deps)).rejects.toThrow(
      "email already registered",
    );

    expect(calls).toEqual([
      "createOrganization",
      "createLocation",
      "createAdminAuthUser",
      "deleteLocation",
      "deleteOrganization",
    ]);
  });

  it("rolls back the auth user, then the location, then the organization if creating the membership fails", async () => {
    const { deps, calls, memberships } = makeFakeDeps({
      async createMembership() {
        throw new Error("org_members insert failed");
      },
    });

    await expect(provisionOrganization(makeInput(), deps)).rejects.toThrow(
      "org_members insert failed",
    );

    expect(calls).toEqual([
      "createOrganization",
      "createLocation",
      "createAdminAuthUser",
      "createMembership",
      "deleteAuthUser",
      "deleteLocation",
      "deleteOrganization",
    ]);
    // The one property this whole ticket cares about most: a failed run
    // never leaves a membership row behind.
    expect(memberships).toHaveLength(0);
  });

  it("never calls createMembership more than once, even on the happy path", async () => {
    let membershipCalls = 0;
    const { deps } = makeFakeDeps({
      async createMembership(input) {
        membershipCalls++;
        return { orgId: input.orgId, userId: input.userId, role: "admin" };
      },
    });

    await provisionOrganization(makeInput(), deps);

    expect(membershipCalls).toBe(1);
  });

  it("reports a rollback failure via onRollbackError but still rejects with the original error", async () => {
    const rollbackErrors: Array<{ step: string; error: unknown }> = [];
    const { deps } = makeFakeDeps({
      async createAdminAuthUser() {
        throw new Error("auth create failed");
      },
      async deleteLocation() {
        throw new Error("delete location failed");
      },
      onRollbackError(step, error) {
        rollbackErrors.push({ step, error });
      },
    });

    await expect(provisionOrganization(makeInput(), deps)).rejects.toThrow("auth create failed");

    expect(rollbackErrors).toEqual([
      { step: "deleteLocation", error: expect.any(Error) },
    ]);
  });
});
