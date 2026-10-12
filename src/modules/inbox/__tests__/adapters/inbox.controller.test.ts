import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { InMemoryIdempotencyStore } from "../../../../infra/http/idempotency.js";
import { problemHandler } from "../../../../infra/http/problem-details.js";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { createInboxRouter } from "../../adapters/in/inbox.controller.js";
import { InboxUseCases } from "../../application/use-cases/inbox.use-cases.js";
import { directory, FakeSource, item } from "../fakes/fake-inbox.js";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const express = require("express") as typeof import("express");

describe("API /api/novo-rh/inbox", () => {
  let server: Server;
  let base: string;
  let n = 0;
  let source: FakeSource;

  beforeEach(async () => {
    source = new FakeSource("leave", "hr.leave", [item("leave", "l1", "e-ana")]);
    const uc = new InboxUseCases([source], directory);
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.auth = { sub: "u-me", email: "gestor@demo.invalid", orgId: mintOrganizationId("org-a"), orgRole: "manager" };
      next();
    });
    app.use("/api", createInboxRouter(uc, new InMemoryIdempotencyStore(), (req) => ({ actor: { userId: req.auth!.sub, email: req.auth!.email }, can: () => true, canSee: async () => true, canPrivate: false })));
    app.use(problemHandler);
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/novo-rh/inbox`;
  });
  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const decide = (body: unknown, key = `k-${++n}`) => fetch(`${base}/decide`, { method: "POST", headers: { "content-type": "application/json", "Idempotency-Key": key }, body: JSON.stringify(body) });

  test("lista, decide e um duplo clique (mesma Idempotency-Key) só decide uma vez", async () => {
    const list = await (await fetch(base)).json();
    expect(list.counters.leave).toEqual({ mine: 1, others: 0 });
    const first = await decide({ items: ["leave:l1"], decision: "approve" }, "same");
    expect((await first.json()).results).toEqual([{ key: "leave:l1", ok: true }]);
    const again = await decide({ items: ["leave:l1"], decision: "approve" }, "same");
    expect(again.headers.get("idempotent-replayed")).toBe("true");
    expect(source.decided).toHaveLength(1);
  });

  test("recusa sem motivo → 400 com o campo", async () => {
    const r = await decide({ items: ["leave:l1"], decision: "reject" });
    expect(r.status).toBe(400);
    expect((await r.json()).field).toBe("comment");
  });
});
