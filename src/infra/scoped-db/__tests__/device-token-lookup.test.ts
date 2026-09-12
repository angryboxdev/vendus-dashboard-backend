/**
 * Mirrors object-storage.test.ts's mocking shape for this sibling helper:
 * `getSupabaseServiceRole` is mocked at the module boundary so these stay
 * fast, DB-free tests.
 */
let currentClient: unknown;

jest.mock("../supabase-client.js", () => ({
  getSupabaseServiceRole: () => currentClient,
}));

import { findLocationTokenScopeByHash } from "../device-token-lookup.js";

describe("findLocationTokenScopeByHash", () => {
  it("throws — rather than returning null — when the Supabase client is unavailable", async () => {
    currentClient = null;

    await expect(findLocationTokenScopeByHash("some-hash")).rejects.toThrow(
      "Supabase service role não configurado",
    );
  });

  it("returns the scope row when the client finds a match", async () => {
    currentClient = {
      from() {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          maybeSingle() {
            return Promise.resolve({ data: { org_id: "org-a", location_id: "loc-1" }, error: null });
          },
        };
      },
    };

    const result = await findLocationTokenScopeByHash("some-hash");

    expect(result).toEqual({ organizationId: "org-a", locationId: "loc-1" });
  });

  it("returns null when no row matches the hash", async () => {
    currentClient = {
      from() {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          maybeSingle() {
            return Promise.resolve({ data: null, error: null });
          },
        };
      },
    };

    const result = await findLocationTokenScopeByHash("some-hash");

    expect(result).toBeNull();
  });

  it("throws on a genuine DB error", async () => {
    currentClient = {
      from() {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          maybeSingle() {
            return Promise.resolve({ data: null, error: { message: "connection timeout" } });
          },
        };
      },
    };

    await expect(findLocationTokenScopeByHash("some-hash")).rejects.toThrow("connection timeout");
  });
});
