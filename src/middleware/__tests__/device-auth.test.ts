import type { NextFunction, Request, Response } from "express";
import { createHash } from "node:crypto";
import {
  createDeviceAuthMiddleware,
  resolveDeviceAuth,
  DEVICE_TOKEN_HEADER,
  DEVICE_TOKEN_QUERY_PARAM,
  type DeviceScopeRow,
  type DeviceTokenLookup,
} from "../device-auth-middleware.js";
const RAW_TOKEN = "raw-token-value";
const TOKEN_HASH = createHash("sha256").update(RAW_TOKEN).digest("hex");

const SCOPE_ROW: DeviceScopeRow = { organizationId: "org-a", locationId: "loc-1" };

function fakeLookupToken(rowsByHash: Record<string, DeviceScopeRow | null>) {
  const calls: string[] = [];
  const fn: DeviceTokenLookup = async (tokenHash: string) => {
    calls.push(tokenHash);
    return rowsByHash[tokenHash] ?? null;
  };
  return { fn, calls };
}

describe("resolveDeviceAuth", () => {
  it("a valid token resolves to the scope stored under its hash", async () => {
    const lookup = fakeLookupToken({ [TOKEN_HASH]: SCOPE_ROW });

    const result = await resolveDeviceAuth(RAW_TOKEN, lookup.fn);

    expect(result).toEqual({
      status: "ok",
      scope: { organizationId: "org-a", locationId: "loc-1" },
    });
    expect(lookup.calls).toEqual([TOKEN_HASH]);
  });

  it("a missing token is rejected without calling the lookup", async () => {
    const lookup = fakeLookupToken({});

    const result = await resolveDeviceAuth(null, lookup.fn);

    expect(result).toEqual({ status: "rejected" });
    expect(lookup.calls).toEqual([]);
  });

  it("an unknown token is rejected", async () => {
    const lookup = fakeLookupToken({}); // no entry -> null

    const result = await resolveDeviceAuth("some-unknown-token", lookup.fn);

    expect(result).toEqual({ status: "rejected" });
  });

  it("a revoked token (deleted row, so also absent from lookup) is rejected identically to an unknown one", async () => {
    // Revocation is a row delete (D4/Solution section) — the lookup simply
    // returns null, same as for a token that never existed.
    const lookup = fakeLookupToken({});

    const revokedResult = await resolveDeviceAuth("revoked-token", lookup.fn);
    const unknownResult = await resolveDeviceAuth("never-existed-token", lookup.fn);

    expect(revokedResult).toEqual({ status: "rejected" });
    expect(revokedResult).toEqual(unknownResult);
  });

  it("missing, unknown and revoked tokens all produce the exact same outcome — no distinguishing signal (story 35)", async () => {
    const lookup = fakeLookupToken({});

    const missing = await resolveDeviceAuth(null, lookup.fn);
    const unknown = await resolveDeviceAuth("unknown-token", lookup.fn);
    const revoked = await resolveDeviceAuth("revoked-token", lookup.fn);

    expect(missing).toEqual(unknown);
    expect(unknown).toEqual(revoked);
  });
});

describe("createDeviceAuthMiddleware", () => {
  function fakeReqRes(opts: { header?: string; query?: Record<string, string> } = {}) {
    const req = {
      headers: opts.header ? { [DEVICE_TOKEN_HEADER]: opts.header } : {},
      query: opts.query ?? {},
    } as unknown as Request;
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const res = { status } as unknown as Response;
    const next = jest.fn() as unknown as NextFunction;
    return { req, res, next, status, json };
  }

  it("a valid token via the header populates req.deviceAuth and calls next", async () => {
    const lookup = fakeLookupToken({ [TOKEN_HASH]: SCOPE_ROW });
    const middleware = createDeviceAuthMiddleware({ lookupToken: lookup.fn });

    const { req, res, next } = fakeReqRes({ header: RAW_TOKEN });
    await middleware.requireDeviceAuth(req, res, next);

    expect(req.deviceAuth).toEqual({ organizationId: "org-a", locationId: "loc-1" });
    expect(next).toHaveBeenCalled();
  });

  it("no token at all is rejected with 401 — the unattended-scope fallback was removed in ticket 06", async () => {
    const lookup = fakeLookupToken({});
    const middleware = createDeviceAuthMiddleware({ lookupToken: lookup.fn });

    const { req, res, next, status, json } = fakeReqRes();
    await middleware.requireDeviceAuth(req, res, next);

    expect(req.deviceAuth).toBeUndefined();
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("an unknown token via the header is rejected with 401, the same as a missing one", async () => {
    const lookup = fakeLookupToken({});
    const middleware = createDeviceAuthMiddleware({ lookupToken: lookup.fn });

    const { req, res, next, status, json } = fakeReqRes({ header: "unknown-token" });
    await middleware.requireDeviceAuth(req, res, next);

    expect(req.deviceAuth).toBeUndefined();
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("a revoked token via the header is rejected with the exact same status and body as an unknown one", async () => {
    const lookup = fakeLookupToken({});
    const middleware = createDeviceAuthMiddleware({ lookupToken: lookup.fn });

    const unknown = fakeReqRes({ header: "unknown-token" });
    await middleware.requireDeviceAuth(unknown.req, unknown.res, unknown.next);

    const revoked = fakeReqRes({ header: "revoked-token" });
    await middleware.requireDeviceAuth(revoked.req, revoked.res, revoked.next);

    expect(revoked.status).toHaveBeenCalledWith(401);
    expect(revoked.json.mock.calls[0]).toEqual(unknown.json.mock.calls[0]);
  });

  it("requireDeviceAuth ignores a query-parameter token — header transport only, so it's rejected as if no token were sent", async () => {
    const lookup = fakeLookupToken({ [TOKEN_HASH]: SCOPE_ROW });
    const middleware = createDeviceAuthMiddleware({ lookupToken: lookup.fn });

    const { req, res, next, status } = fakeReqRes({ query: { [DEVICE_TOKEN_QUERY_PARAM]: RAW_TOKEN } });
    await middleware.requireDeviceAuth(req, res, next);

    // No header present at all -> rejected, exactly as if no token had been
    // supplied (no fallback left to catch it).
    expect(req.deviceAuth).toBeUndefined();
    expect(status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("requireDeviceAuthAllowingQueryParam accepts a token via the query string (KDS SSE exception, D7)", async () => {
    const lookup = fakeLookupToken({ [TOKEN_HASH]: SCOPE_ROW });
    const middleware = createDeviceAuthMiddleware({ lookupToken: lookup.fn });

    const { req, res, next } = fakeReqRes({ query: { [DEVICE_TOKEN_QUERY_PARAM]: RAW_TOKEN } });
    await middleware.requireDeviceAuthAllowingQueryParam(req, res, next);

    expect(req.deviceAuth).toEqual({ organizationId: "org-a", locationId: "loc-1" });
    expect(next).toHaveBeenCalled();
  });

  it("requireDeviceAuthAllowingQueryParam still prefers the header over the query param", async () => {
    const otherRow: DeviceScopeRow = { organizationId: "org-b", locationId: "loc-2" };
    const otherHash = createHash("sha256").update("header-token").digest("hex");
    const lookup = fakeLookupToken({ [otherHash]: otherRow, [TOKEN_HASH]: SCOPE_ROW });
    const middleware = createDeviceAuthMiddleware({ lookupToken: lookup.fn });

    const { req, res, next } = fakeReqRes({
      header: "header-token",
      query: { [DEVICE_TOKEN_QUERY_PARAM]: RAW_TOKEN },
    });
    await middleware.requireDeviceAuthAllowingQueryParam(req, res, next);

    expect(req.deviceAuth).toEqual({ organizationId: "org-b", locationId: "loc-2" });
  });

  it("requireDeviceAuthAllowingQueryParam rejects with 401 when neither header nor query param carry a token", async () => {
    const lookup = fakeLookupToken({});
    const middleware = createDeviceAuthMiddleware({ lookupToken: lookup.fn });

    const { req, res, next, status } = fakeReqRes();
    await middleware.requireDeviceAuthAllowingQueryParam(req, res, next);

    expect(req.deviceAuth).toBeUndefined();
    expect(status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
