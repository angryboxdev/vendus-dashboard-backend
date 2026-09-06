import type { AddressInfo } from "node:net";
import type { Express } from "express";
import type { Server } from "node:http";
import { createHash } from "node:crypto";

// `import express from "express"` needs esModuleInterop, which
// tsconfig.test.json deliberately doesn't set (mirrors the rest of this
// repo's test suite, none of which default-imports a CJS package) — a
// plain `require` sidesteps the interop mismatch instead of changing that
// config for every test.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const express = require("express") as typeof import("express");
import type { GeneratePairingCodePort } from "../../../domain/ports/in/generate-pairing-code.port.js";
import type { RedeemPairingCodePort } from "../../../domain/ports/in/redeem-pairing-code.port.js";
import type { ListActiveTokensPort } from "../../../domain/ports/in/list-active-tokens.port.js";
import type { RevokeTokenPort } from "../../../domain/ports/in/revoke-token.port.js";
import type { DeviceScopeRow } from "../../../../../middleware/device-auth-middleware.js";

/**
 * Exercises `GET /location-credentials/tokens/me` through the real Express
 * router and the real `requireDeviceAuth` middleware (hashing and header
 * extraction included, no fallback since ticket 06) — only the DB lookup
 * seam (`infra/scoped-db/device-token-lookup.ts`) is faked, the same seam
 * the module's own integration test replaces with a real local Supabase
 * client. No supertest dependency: a real `http.Server` plus the platform's
 * built-in `fetch`, mirroring this repo's "no new dependency without asking"
 * rule.
 */

const RAW_TOKEN = "a-valid-device-token";
const TOKEN_HASH = createHash("sha256").update(RAW_TOKEN).digest("hex");
const SCOPE_ROW: DeviceScopeRow = { organizationId: "org-a", locationId: "loc-1" };

let lookupByHash: Record<string, DeviceScopeRow | null> = {};

jest.mock("../../../../../infra/scoped-db/device-token-lookup.js", () => ({
  findLocationTokenScopeByHash: async (hash: string) => lookupByHash[hash] ?? null,
}));

// The controller also imports `requireAuth`/`requireMinRole` for its
// (unrelated) adminRouter routes, which transitively pulls in `jose` — an
// ESM-only package ts-jest can't transform. This route is on deviceRouter
// and never touches those, so the real implementations aren't needed here.
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

describe("GET /location-credentials/tokens/me", () => {
  let app: Express;
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    // Dynamic import, after the mock above is registered — a static
    // top-level import would resolve the real device-token-lookup module
    // first (mirrors the module's own integration test).
    const { LocationCredentialController } = await import(
      "../../../adapters/in/location-credential.controller.js"
    );

    const controller = new LocationCredentialController(
      unusedPort<GeneratePairingCodePort>(),
      unusedPort<RedeemPairingCodePort>(),
      unusedPort<ListActiveTokensPort>(),
      unusedPort<RevokeTokenPort>(),
    );

    app = express();
    app.use(controller.deviceRouter);

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

  it("a valid token returns 200 with the location the middleware resolved", async () => {
    lookupByHash = { [TOKEN_HASH]: SCOPE_ROW };

    const res = await fetch(`${baseUrl}/location-credentials/tokens/me`, {
      headers: { "x-device-token": RAW_TOKEN },
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ locationId: "loc-1" });
  });

  it("a revoked token (absent from the lookup, same as unknown) returns 401", async () => {
    lookupByHash = {};

    const res = await fetch(`${baseUrl}/location-credentials/tokens/me`, {
      headers: { "x-device-token": "revoked-token" },
    });

    expect(res.status).toBe(401);
  });

  it("an unknown token returns 401", async () => {
    lookupByHash = {};

    const res = await fetch(`${baseUrl}/location-credentials/tokens/me`, {
      headers: { "x-device-token": "never-issued-token" },
    });

    expect(res.status).toBe(401);
  });

  it("no token at all is rejected with 401 — the UNATTENDED_SCOPE fallback was removed in ticket 06", async () => {
    const res = await fetch(`${baseUrl}/location-credentials/tokens/me`);

    expect(res.status).toBe(401);
  });
});
