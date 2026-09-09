import type { AddressInfo } from "node:net";
import type { Express } from "express";
import type { Server } from "node:http";
import { createHash } from "node:crypto";

// `import express from "express"` needs esModuleInterop, which
// tsconfig.test.json deliberately doesn't set (mirrors the rest of this
// repo's test suite) — a plain `require` sidesteps the interop mismatch.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const express = require("express") as typeof import("express");
import type { DeviceScopeRow } from "../../middleware/device-auth-middleware.js";
import type { KioskScanResult } from "../../domain/hrTypes.js";

/**
 * `hrKioskRoutes.ts` had no controller-level test (spec.md's kiosk-pin
 * fix, Section A Testing Decisions) — this is that baseline test, added for
 * ticket 02's DA3 decision (option b: header-only backend, no widening of
 * `requireDeviceAuthAllowingQueryParam`). Exercises the real Express router
 * and the real `requireDeviceAuth` middleware (hashing, header extraction,
 * no query-param fallback) — only the DB lookup seam
 * (`infra/scoped-db/device-token-lookup.ts`) is faked, mirroring
 * `tokens-me-route.test.ts` / `public-router-scope.test.ts`.
 *
 * `hrKioskService.kioskScan` itself is faked too: its real implementation
 * makes several more Supabase round-trips (shift lookup, attendance
 * lookup/insert) that are its own business logic, not what this route-level
 * test is about — the thing DA3 actually changed is whether a device
 * credential presented as a header reaches the route handler at all.
 */

const RAW_TOKEN = "a-valid-device-token";
const TOKEN_HASH = createHash("sha256").update(RAW_TOKEN).digest("hex");
const SCOPE_ROW: DeviceScopeRow = { organizationId: "org-a", locationId: "loc-1" };

const VALID_SCAN_BODY = { token: "daily-hmac-token", date: "2026-09-09", pin: "1234" };

const SCAN_RESULT: KioskScanResult = {
  action: "check_in",
  employee: { id: "emp-1", fullName: "Ana Costa" },
  time: "09:00",
  shift: { startTime: "09:00", endTime: "17:00" },
};

let lookupByHash: Record<string, DeviceScopeRow | null> = {};

jest.mock("../../infra/scoped-db/device-token-lookup.js", () => ({
  findLocationTokenScopeByHash: async (hash: string) => lookupByHash[hash] ?? null,
}));

// `hrRoutes`-adjacent PATCH route pulls `requireAuth`/`requireMinRole`,
// which transitively import `jose` (ESM-only, ts-jest can't transform).
// This suite never exercises that route.
jest.mock("../../middleware/auth.js", () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireMinRole: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// Fire-and-forget in the real route (`void logAudit(...)`) — faked so a
// passing scan never makes a real Supabase call.
jest.mock("../../services/hrAuditService.js", () => ({
  logAudit: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../services/hrKioskService.js", () => {
  class KioskError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.name = "KioskError";
      this.status = status;
    }
  }
  return {
    KioskError,
    getTodayKioskToken: jest.fn(),
    kioskScan: jest.fn(),
  };
});

describe("POST /kiosk/scan", () => {
  let app: Express;
  let server: Server;
  let baseUrl: string;
  let kioskScanMock: jest.Mock;

  beforeAll(async () => {
    // Dynamic import, after the mocks above are registered — mirrors
    // tokens-me-route.test.ts / public-router-scope.test.ts.
    const hrKioskService = await import("../../services/hrKioskService.js");
    kioskScanMock = hrKioskService.kioskScan as jest.Mock;

    const { hrKioskRoutes } = await import("../hrKioskRoutes.js");

    app = express();
    app.use(express.json());
    app.use(hrKioskRoutes);

    await new Promise<void>((resolve) => {
      server = app.listen(0, resolve);
    });
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    lookupByHash = {};
    kioskScanMock.mockReset();
  });

  it("a valid X-Device-Token header succeeds, matching existing success-path behavior", async () => {
    lookupByHash = { [TOKEN_HASH]: SCOPE_ROW };
    kioskScanMock.mockResolvedValue(SCAN_RESULT);

    const res = await fetch(`${baseUrl}/kiosk/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-device-token": RAW_TOKEN },
      body: JSON.stringify(VALID_SCAN_BODY),
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual(SCAN_RESULT);
    // Resolved from `req.deviceAuth`, not the request body — device auth
    // is what supplies organization/location on this route (D14).
    expect(kioskScanMock).toHaveBeenCalledWith("org-a", "loc-1", VALID_SCAN_BODY);
  });

  it("no X-Device-Token header still 401s — no query-param fallback (DA3 option b)", async () => {
    const res = await fetch(`${baseUrl}/kiosk/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_SCAN_BODY),
    });

    expect(res.status).toBe(401);
    expect(kioskScanMock).not.toHaveBeenCalled();
  });

  it("an invalid/unknown X-Device-Token header still 401s", async () => {
    lookupByHash = {};

    const res = await fetch(`${baseUrl}/kiosk/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-device-token": "never-issued-token" },
      body: JSON.stringify(VALID_SCAN_BODY),
    });

    expect(res.status).toBe(401);
    expect(kioskScanMock).not.toHaveBeenCalled();
  });

  it("the device token is not accepted as a query parameter (header-only, DA3 option b)", async () => {
    const res = await fetch(`${baseUrl}/kiosk/scan?device_token=${RAW_TOKEN}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_SCAN_BODY),
    });

    expect(res.status).toBe(401);
    expect(kioskScanMock).not.toHaveBeenCalled();
  });
});
