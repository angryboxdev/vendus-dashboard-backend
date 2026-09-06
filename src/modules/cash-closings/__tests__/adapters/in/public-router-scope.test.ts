import type { AddressInfo } from "node:net";
import type { Express } from "express";
import type { Server } from "node:http";
import { createHash } from "node:crypto";

// Mirrors location-credentials' tokens-me-route.test.ts: a plain `require`
// sidesteps the esModuleInterop mismatch (tsconfig.test.json deliberately
// doesn't set it), and `requireAuth`/`requireMinRole` are mocked because
// `managedRouter` transitively pulls in `jose`, an ESM-only package
// ts-jest can't transform — this test never touches `managedRouter`.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const express = require("express") as typeof import("express");
import type { VerifyPinPort } from "../../../domain/ports/in/verify-pin.port.js";
import type { SubmitClosingPort } from "../../../domain/ports/in/submit-closing.port.js";
import type { ListClosingsPort } from "../../../domain/ports/in/list-closings.port.js";
import type { GetClosingPort } from "../../../domain/ports/in/get-closing.port.js";
import type { ReviewClosingPort } from "../../../domain/ports/in/review-closing.port.js";
import type { GetAvailableSessionsPort } from "../../../domain/ports/in/get-available-sessions.port.js";
import type { GetAirMenuTotalsPort } from "../../../domain/ports/in/get-airmenu-totals.port.js";
import type { DeviceScopeRow } from "../../../../../middleware/device-auth-middleware.js";

/**
 * Regression test for a routing-scope bug ticket 06's smoke test caught
 * live: `publicRouter.use(requireDeviceAuth)` with **no path** applies to
 * every request that reaches this router, not only this module's own
 * `/cash-closings/...` routes — and `server.ts` mounts `publicRouter` at
 * the bare `/api` prefix, the same mount point every other module's router
 * shares. While `requireDeviceAuth` always fell back to `UNATTENDED_SCOPE`
 * and called `next()` unconditionally, this was invisible; once the
 * fallback was removed (ticket 06), an unrelated `/api/*` route reaching
 * this router first would have been rejected with 401 before ever reaching
 * its own handler. Fixed by scoping the mount to `/cash-closings`
 * (`this.publicRouter.use("/cash-closings", requireDeviceAuth)`).
 *
 * Exercises the real Express router and the real `requireDeviceAuth`
 * middleware (hashing, header extraction, no-fallback rejection included)
 * — only the DB lookup seam is faked, same approach as
 * `tokens-me-route.test.ts`. No supertest dependency: a real `http.Server`
 * plus the platform's built-in `fetch`.
 */

const RAW_TOKEN = "a-valid-device-token";
const TOKEN_HASH = createHash("sha256").update(RAW_TOKEN).digest("hex");
const SCOPE_ROW: DeviceScopeRow = { organizationId: "org-a", locationId: "loc-1" };

let lookupByHash: Record<string, DeviceScopeRow | null> = {};

jest.mock("../../../../../infra/scoped-db/device-token-lookup.js", () => ({
  findLocationTokenScopeByHash: async (hash: string) => lookupByHash[hash] ?? null,
}));

jest.mock("../../../../../middleware/auth.js", () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireMinRole: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

function unusedPort<T>(): T {
  return {
    execute: async () => {
      throw new Error("not exercised by this test");
    },
  } as unknown as T;
}

describe("CashClosingController.publicRouter — mount scope", () => {
  let app: Express;
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    // Dynamic import, after the mocks above are registered — mirrors
    // tokens-me-route.test.ts.
    const { CashClosingController } = await import("../../../adapters/in/cash-closing.controller.js");

    const controller = new CashClosingController(
      unusedPort<VerifyPinPort>(),
      unusedPort<SubmitClosingPort>(),
      unusedPort<ListClosingsPort>(),
      unusedPort<GetClosingPort>(),
      unusedPort<ReviewClosingPort>(),
      unusedPort<GetAvailableSessionsPort>(),
      unusedPort<GetAirMenuTotalsPort>(),
    );

    app = express();
    app.use(express.json());

    // Mirrors server.ts: cash-closings' publicRouter mounted at the bare
    // `/api` prefix, exactly the mount point every other module's router
    // shares.
    app.use("/api", controller.publicRouter);

    // Stands in for "every other module mounted at /api" (location-
    // credentials, KDS, locations, ...) — a route with no device-auth
    // requirement at all, reached only if cash-closings' router correctly
    // leaves it alone.
    const otherModuleRouter = express.Router();
    otherModuleRouter.get("/some-other-module/ping", (_req, res) => {
      res.status(200).json({ ok: true });
    });
    app.use("/api", otherModuleRouter);

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
  });

  it("does not intercept a request to a route outside /cash-closings, even with no device token", async () => {
    const res = await fetch(`${baseUrl}/api/some-other-module/ping`);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  it("still rejects its own /cash-closings routes with no device token", async () => {
    const res = await fetch(`${baseUrl}/api/cash-closings/verify-pin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: "1234" }),
    });

    expect(res.status).toBe(401);
  });

  it("still accepts its own /cash-closings routes with a valid device token, past the auth layer", async () => {
    lookupByHash = { [TOKEN_HASH]: SCOPE_ROW };

    const res = await fetch(`${baseUrl}/api/cash-closings/verify-pin`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-device-token": RAW_TOKEN },
      body: JSON.stringify({ pin: "not-4-digits" }),
    });

    // The unused fake port throws if reached, and a body-validation
    // rejection (400, "PIN inválido") only happens after requireDeviceAuth
    // has already accepted the token — so any outcome other than 401
    // proves the token was accepted, not swallowed by device auth.
    expect(res.status).not.toBe(401);
  });
});
