import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { InMemoryIdempotencyStore } from "../../../infra/http/idempotency.js";
import { problemHandler } from "../../../infra/http/problem-details.js";
import { mintOrganizationId, type OrganizationId } from "../../../kernel/organization-id.js";
import { createWorkspaceRouter } from "../adapters/in/workspace.controller.js";
import { WorkspaceUseCases } from "../application/use-cases/workspace.use-cases.js";
import type { Presence } from "../domain/entities/workspace.js";
import type { WorkspaceContextPort, WorkspaceRepositoryPort } from "../domain/ports/out/workspace.ports.js";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const express = require("express") as typeof import("express");

const present: Presence[] = [
  { employeeId: "e9", name: "Gestora", state: "work", since: "2026-10-12T08:00:00Z", locationIds: ["porto"] },
  { employeeId: "e2", name: "Bruno", state: "work", since: "2026-10-12T08:30:00Z", locationIds: ["lisboa"] },
];

const ctx: WorkspaceContextPort = {
  employeeForUser: async (_o: OrganizationId, userId: string) => (userId === "u-e1" ? "e1" : null),
  employeeLocations: async () => ["porto"],
  presentNow: async () => present,
  whosInScope: async () => "own_location",
  now: () => "2026-10-12T10:00:00.000Z",
  notify: async () => undefined,
  userOfEmployee: async () => null,
  audit: async () => undefined,
};

describe("API /api/me/whos-in", () => {
  let server: Server;
  let base: string;
  beforeAll(async () => {
    const uc = new WorkspaceUseCases({} as WorkspaceRepositoryPort, ctx);
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.auth = { sub: "u-e1", email: "ana@demo.invalid", orgId: mintOrganizationId("org-a"), orgRole: "employee" };
      next();
    });
    app.use("/api", createWorkspaceRouter(uc, new InMemoryIdempotencyStore()));
    app.use(problemHandler);
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  });
  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  test("CF_15_http_a_API_nao_devolve_colegas_de_outros_centros_nem_contactos", async () => {
    const body = await (await fetch(`${base}/me/whos-in`)).json();
    expect(body.scope).toBe("own_location");
    expect(body.people).toEqual([{ employeeId: "e9", name: "Gestora", state: "work", since: "2026-10-12T08:00:00Z" }]);
    expect(JSON.stringify(body)).not.toContain("lisboa");
    expect(JSON.stringify(body)).not.toContain("Bruno");
  });
});
