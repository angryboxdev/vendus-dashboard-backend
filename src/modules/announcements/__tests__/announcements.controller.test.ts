import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { InMemoryIdempotencyStore } from "../../../infra/http/idempotency.js";
import { problemHandler } from "../../../infra/http/problem-details.js";
import { mintOrganizationId } from "../../../kernel/organization-id.js";
import { createAnnouncementsRouter } from "../adapters/in/announcements.controller.js";
import { AnnouncementsUseCases } from "../application/use-cases/announcements.use-cases.js";
import type { Announcement } from "../domain/entities/announcement.js";
import type { AnnouncementsContextPort, AnnouncementsRepositoryPort } from "../domain/ports/out/announcements.ports.js";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const express = require("express") as typeof import("express");

/** Repositório mínimo em memória (o detalhe está nos testes dos casos de uso). */
function memoryRepo(): AnnouncementsRepositoryPort {
  const items: Announcement[] = [];
  const recipients: { id: string; employeeId: string; userId: string | null }[] = [];
  return {
    list: async () => items,
    get: async (_o, id) => items.find((a) => a.id === id) ?? null,
    create: async (_o, a) => {
      const row: Announcement = { ...a, id: "a1", status: "draft", currentVersion: 1, publishedAt: null, publishedBy: null, createdAt: "x" };
      items.push(row);
      return row;
    },
    update: async (_o, id, p) => Object.assign(items.find((a) => a.id === id)!, p),
    insertVersion: async () => undefined,
    listVersions: async () => [],
    insertRecipients: async (_o, id, r) => void recipients.push(...r.map((x) => ({ ...x, id }))),
    listRecipients: async (_o, id) => recipients.filter((r) => r.id === id),
    recipientAnnouncements: async () => [],
    insertReceipts: async () => undefined,
    listReceipts: async () => [],
    markReceipt: async () => null,
  };
}

const ctx: AnnouncementsContextPort = {
  resolveAudience: async () => [{ employeeId: "e1", userId: "u-e1" }],
  employeeForUser: async () => null,
  notify: async () => undefined,
  now: () => "2026-10-12T10:00:00.000Z",
  audit: async () => undefined,
};

describe("API /api/novo-rh/announcements", () => {
  let server: Server;
  let base: string;
  let n = 0;
  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.auth = { sub: "u-rh", email: "rh@demo.invalid", orgId: mintOrganizationId("org-a"), orgRole: "admin" };
      next();
    });
    app.use("/api", createAnnouncementsRouter(new AnnouncementsUseCases(memoryRepo(), ctx), new InMemoryIdempotencyStore()));
    app.use(problemHandler);
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/novo-rh/announcements`;
  });
  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const send = (method: string, path: string, body: unknown) => fetch(`${base}${path}`, { method, headers: { "content-type": "application/json", "Idempotency-Key": `k-${++n}` }, body: JSON.stringify(body) });

  test("RE_31_http_mudar_destinatarios_depois_de_publicar_e_409", async () => {
    const a = await (await send("POST", "", { title: "Aviso", body: "x", audience: { type: "all" } })).json();
    expect((await send("POST", `/${a.id}/publish`, {})).status).toBe(200);
    const r = await send("PATCH", `/${a.id}`, { audience: { type: "employees", ids: ["e2"] } });
    expect(r.status).toBe(409);
    expect((await r.json()).type).toBe("/problems/audience_frozen");
  });
});
