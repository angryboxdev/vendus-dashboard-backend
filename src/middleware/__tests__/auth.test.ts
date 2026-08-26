import type { NextFunction, Request, Response } from "express";
import {
  createAuthMiddleware,
  resolveAuth,
  type Membership,
  type MembershipLookup,
  type TokenVerifier,
  type VerifiedClaims,
} from "../auth-middleware.js";

function fakeVerifyToken(claimsByToken: Record<string, VerifiedClaims | null>): TokenVerifier {
  return async (token: string) => claimsByToken[token] ?? null;
}

function fakeLookupMembership(membershipsBySub: Record<string, Membership | null>) {
  const calls: string[] = [];
  const fn: MembershipLookup = async (userId: string) => {
    calls.push(userId);
    return membershipsBySub[userId] ?? null;
  };
  return { fn, calls };
}

const CLAIMS_NO_ORG: VerifiedClaims = { sub: "user-1", email: "user@angrybox.pt" };
const CLAIMS_WITH_ORG: VerifiedClaims = {
  sub: "user-1",
  email: "user@angrybox.pt",
  orgId: "org-from-token",
  role: "manager",
};

describe("resolveAuth", () => {
  it("exactly one membership yields a payload carrying the org and its role", async () => {
    const lookup = fakeLookupMembership({ "user-1": { orgId: "org-a", role: "manager" } });

    const result = await resolveAuth(
      "token",
      fakeVerifyToken({ token: CLAIMS_NO_ORG }),
      lookup.fn,
    );

    expect(result).toEqual({
      status: "ok",
      payload: { sub: "user-1", email: "user@angrybox.pt", orgId: "org-a", orgRole: "manager" },
    });
  });

  it("zero memberships yields no payload (ambiguous-membership refusal)", async () => {
    const lookup = fakeLookupMembership({}); // no entry -> null

    const result = await resolveAuth(
      "token",
      fakeVerifyToken({ token: CLAIMS_NO_ORG }),
      lookup.fn,
    );

    expect(result).toEqual({ status: "ambiguous-membership", sub: "user-1" });
  });

  it("two memberships yields no payload (ambiguous-membership refusal)", async () => {
    // The lookup port itself collapses zero and two-or-more to null — the
    // fake simulates that by also returning null here.
    const lookup = fakeLookupMembership({ "user-1": null });

    const result = await resolveAuth(
      "token",
      fakeVerifyToken({ token: CLAIMS_NO_ORG }),
      lookup.fn,
    );

    expect(result).toEqual({ status: "ambiguous-membership", sub: "user-1" });
  });

  it("trusts a token carrying the org claim without calling the membership lookup", async () => {
    const lookup = fakeLookupMembership({ "user-1": { orgId: "org-a", role: "hr_viewer" } });

    const result = await resolveAuth(
      "token",
      fakeVerifyToken({ token: CLAIMS_WITH_ORG }),
      lookup.fn,
    );

    expect(result).toEqual({
      status: "ok",
      payload: {
        sub: "user-1",
        email: "user@angrybox.pt",
        orgId: "org-from-token",
        orgRole: "manager",
      },
    });
    expect(lookup.calls).toEqual([]);
  });

  it("falls back to the membership lookup when the token has no org claim, applying the same unambiguity rule", async () => {
    const lookup = fakeLookupMembership({ "user-1": { orgId: "org-b", role: "admin" } });

    const result = await resolveAuth(
      "token",
      fakeVerifyToken({ token: CLAIMS_NO_ORG }),
      lookup.fn,
    );

    expect(lookup.calls).toEqual(["user-1"]);
    expect(result).toEqual({
      status: "ok",
      payload: { sub: "user-1", email: "user@angrybox.pt", orgId: "org-b", orgRole: "admin" },
    });
  });

  it("an invalid token yields no-auth, not the ambiguous-membership refusal", async () => {
    const lookup = fakeLookupMembership({});

    const result = await resolveAuth(
      "bad-token",
      fakeVerifyToken({ token: CLAIMS_NO_ORG }), // "bad-token" is not a known key -> null
      lookup.fn,
    );

    expect(result).toEqual({ status: "no-auth" });
    expect(lookup.calls).toEqual([]);
  });

  it("an absent token yields no-auth, not the ambiguous-membership refusal", async () => {
    const lookup = fakeLookupMembership({});

    const result = await resolveAuth(null, fakeVerifyToken({}), lookup.fn);

    expect(result).toEqual({ status: "no-auth" });
    expect(lookup.calls).toEqual([]);
  });
});

describe("createAuthMiddleware", () => {
  function fakeReqRes(authHeader?: string) {
    const req = { headers: { authorization: authHeader } } as unknown as Request;
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const res = { status } as unknown as Response;
    const next = jest.fn() as unknown as NextFunction;
    return { req, res, next, status, json };
  }

  it("is constructible with fakes for both collaborators, with no network or database reached", async () => {
    const lookup = fakeLookupMembership({ "user-1": { orgId: "org-a", role: "manager" } });
    const middleware = createAuthMiddleware({
      verifyToken: fakeVerifyToken({ "valid-token": CLAIMS_NO_ORG }),
      lookupMembership: lookup.fn,
    });

    const { req, next } = fakeReqRes("Bearer valid-token");
    await middleware.populateAuth(req, {} as Response, next);

    expect(req.auth).toEqual({
      sub: "user-1",
      email: "user@angrybox.pt",
      orgId: "org-a",
      orgRole: "manager",
    });
    expect(next).toHaveBeenCalled();
  });

  it("requireAuth returns the ordinary 401 shape for a plain no-token request", () => {
    const lookup = fakeLookupMembership({});
    const middleware = createAuthMiddleware({
      verifyToken: fakeVerifyToken({}),
      lookupMembership: lookup.fn,
    });

    const { req, res, next, status, json } = fakeReqRes(undefined);
    // req.auth / req.authRefusal are left unset, as populateAuth would leave
    // them for a request with no bearer token at all.
    middleware.requireAuth(req, res, next);

    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: "Autenticação necessária" });
    expect(next).not.toHaveBeenCalled();
  });

  it("requireAuth distinguishes the ambiguous-membership refusal from an ordinary auth failure", async () => {
    const lookup = fakeLookupMembership({}); // zero memberships
    const middleware = createAuthMiddleware({
      verifyToken: fakeVerifyToken({ "valid-token": CLAIMS_NO_ORG }),
      lookupMembership: lookup.fn,
    });

    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const populated = fakeReqRes("Bearer valid-token");
      await middleware.populateAuth(populated.req, {} as Response, populated.next);
      expect(populated.req.auth).toBeUndefined();
      expect(populated.req.authRefusal).toBe("ambiguous-membership");

      const blocked = fakeReqRes("Bearer valid-token");
      blocked.req.authRefusal = populated.req.authRefusal;
      middleware.requireAuth(blocked.req, blocked.res, blocked.next);

      expect(blocked.status).toHaveBeenCalledWith(403);
      expect(blocked.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: "AMBIGUOUS_ORG_MEMBERSHIP" }),
      );
      expect(blocked.next).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalled();
      expect(warnSpy.mock.calls[0]?.[0]).toEqual(expect.stringContaining("AMBIGUOUS_ORG_MEMBERSHIP"));

      // The two refusal shapes must differ from each other.
      const plain = fakeReqRes(undefined);
      middleware.requireAuth(plain.req, plain.res, plain.next);
      expect(plain.status).toHaveBeenCalledWith(401);
      expect(plain.status).not.toHaveBeenCalledWith(403);
    } finally {
      warnSpy.mockRestore();
    }
  });
});
