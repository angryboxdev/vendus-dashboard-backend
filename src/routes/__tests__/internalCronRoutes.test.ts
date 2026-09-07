import type { AddressInfo } from "node:net";
import type { Express } from "express";
import type { Server } from "node:http";

// `import express from "express"` needs esModuleInterop, which
// tsconfig.test.json deliberately doesn't set (mirrors the rest of this
// repo's test suite) — a plain `require` sidesteps the interop mismatch.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const express = require("express") as typeof import("express");

process.env.CRON_SECRET = "test-secret";

// The daily-vendus-consumption route (untouched by this ticket) transitively
// imports `vendusProductsCatalog.ts`, which default-imports `node:fs` — a
// pattern that needs esModuleInterop, which tsconfig.test.json deliberately
// doesn't set (mirrors the rest of this repo's test suite). Mocked out here
// purely to keep this route file importable under ts-jest; this test never
// exercises that route.
jest.mock("../../services/dailyVendusConsumptionJobService.js", () => ({
  runDailyVendusConsumptionJob: async () => {
    throw new Error("not exercised by this test");
  },
}));

import type { OrganizationRow } from "../../infra/scoped-db/organization-listing.js";
import type { ProcessDirectDebitsPort } from "../../modules/invoices/domain/ports/in/invoice.ports.js";
import { mintOrganizationId } from "../../kernel/organization-id.js";

function orgRow(id: string): OrganizationRow {
  return { organizationId: mintOrganizationId(id), name: id };
}

describe("POST /internal/cron/process-direct-debits", () => {
  let app: Express;
  let server: Server;
  let baseUrl: string;
  let executedFor: string[];
  let failFor: Set<string>;

  const processDirectDebits: ProcessDirectDebitsPort = {
    execute: async (organizationId) => {
      executedFor.push(organizationId);
      if (failFor.has(organizationId)) throw new Error(`boom for ${organizationId}`);
      return { processed: 1 };
    },
  };

  async function start(listOrganizations: () => Promise<OrganizationRow[]>) {
    // Dynamic import, after CRON_SECRET is set above — a static top-level
    // import would resolve `config/env.js` first, before the assignment.
    const { createInternalCronRouter } = await import("../internalCronRoutes.js");
    const router = createInternalCronRouter({ processDirectDebits, listOrganizations });
    app = express();
    app.use("/api", router);
    await new Promise<void>((resolve) => {
      server = app.listen(0, resolve);
    });
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  }

  beforeEach(() => {
    executedFor = [];
    failFor = new Set();
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("processes every organization returned by the listing, not a single hardcoded one", async () => {
    await start(async () => [orgRow("org-1"), orgRow("org-2"), orgRow("org-3")]);

    const res = await fetch(`${baseUrl}/api/internal/cron/process-direct-debits`, {
      method: "POST",
      headers: { Authorization: "Bearer test-secret" },
    });

    expect(res.status).toBe(200);
    expect(executedFor.sort()).toEqual(["org-1", "org-2", "org-3"]);
  });

  it("a forced failure for one organization does not stop the others from being processed", async () => {
    await start(async () => [orgRow("org-1"), orgRow("org-2"), orgRow("org-3")]);
    failFor = new Set(["org-2"]);

    const res = await fetch(`${baseUrl}/api/internal/cron/process-direct-debits`, {
      method: "POST",
      headers: { Authorization: "Bearer test-secret" },
    });

    expect(res.status).toBe(200);
    expect(executedFor.sort()).toEqual(["org-1", "org-2", "org-3"]);

    const body = (await res.json()) as {
      succeeded: Array<{ item: OrganizationRow }>;
      failed: Array<{ item: OrganizationRow; reason?: string }>;
    };
    expect(body.succeeded.map((r) => r.item.organizationId).sort()).toEqual(["org-1", "org-3"]);
    expect(body.failed).toHaveLength(1);
    expect(body.failed[0]!.item.organizationId).toBe("org-2");
    expect(body.failed[0]!.reason).toContain("boom for org-2");
  });

  it("logs a per-organization line for both a success and a failure", async () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    await start(async () => [orgRow("org-1"), orgRow("org-2")]);
    failFor = new Set(["org-2"]);

    await fetch(`${baseUrl}/api/internal/cron/process-direct-debits`, {
      method: "POST",
      headers: { Authorization: "Bearer test-secret" },
    });

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("org-1"));
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("org-2"));

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("rejects without a valid cron secret and never lists or processes organizations", async () => {
    const listOrganizations = jest.fn(async () => [orgRow("org-1")]);
    await start(listOrganizations);

    const res = await fetch(`${baseUrl}/api/internal/cron/process-direct-debits`, { method: "POST" });

    expect(res.status).toBe(401);
    expect(listOrganizations).not.toHaveBeenCalled();
    expect(executedFor).toEqual([]);
  });
});
