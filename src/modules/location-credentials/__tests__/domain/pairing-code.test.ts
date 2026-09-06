import { PairingCode } from "../../domain/entities/pairing-code.js";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";

const ORG_A = mintOrganizationId("org-a");

describe("PairingCode entity", () => {
  describe("PairingCode.create", () => {
    it("creates an unburned code", () => {
      const code = PairingCode.create({
        organizationId: ORG_A,
        locationId: "loc-1",
        code: "ABCD1234",
        expiresAt: new Date(Date.now() + 60_000),
      });

      expect(code.isBurned).toBe(false);
      expect(code.burnedAt).toBeNull();
      expect(code.id).toBeDefined();
      expect(code.description).toBeNull();
    });

    it("carries an optional description", () => {
      const code = PairingCode.create({
        organizationId: ORG_A,
        locationId: "loc-1",
        code: "ABCD1234",
        expiresAt: new Date(Date.now() + 60_000),
        description: "Kitchen monitor",
      });

      expect(code.description).toBe("Kitchen monitor");
    });
  });

  describe("isExpired", () => {
    it("is false before the expiry instant", () => {
      const code = PairingCode.create({
        organizationId: ORG_A,
        locationId: "loc-1",
        code: "ABCD1234",
        expiresAt: new Date(Date.now() + 60_000),
      });
      expect(code.isExpired(new Date())).toBe(false);
    });

    it("is true at and after the expiry instant", () => {
      const expiresAt = new Date("2026-01-01T00:00:00Z");
      const code = PairingCode.create({
        organizationId: ORG_A,
        locationId: "loc-1",
        code: "ABCD1234",
        expiresAt,
      });
      expect(code.isExpired(expiresAt)).toBe(true);
      expect(code.isExpired(new Date(expiresAt.getTime() + 1))).toBe(true);
    });
  });

  describe("burn", () => {
    it("marks the code burned", () => {
      const code = PairingCode.create({
        organizationId: ORG_A,
        locationId: "loc-1",
        code: "ABCD1234",
        expiresAt: new Date(Date.now() + 60_000),
      });

      code.burn(new Date());

      expect(code.isBurned).toBe(true);
      expect(code.burnedAt).not.toBeNull();
    });
  });

  describe("PairingCode.reconstitute", () => {
    it("rebuilds from persisted data without re-validating", () => {
      const createdAt = new Date("2026-01-01T00:00:00Z");
      const expiresAt = new Date("2026-01-01T00:10:00Z");
      const code = PairingCode.reconstitute({
        id: "code-1",
        organizationId: ORG_A,
        locationId: "loc-1",
        code: "ZZZZ9999",
        expiresAt,
        burnedAt: null,
        createdAt,
        description: "Reception tablet",
      });

      expect(code.id).toBe("code-1");
      expect(code.code).toBe("ZZZZ9999");
      expect(code.createdAt).toBe(createdAt);
      expect(code.isBurned).toBe(false);
      expect(code.description).toBe("Reception tablet");
    });
  });
});
