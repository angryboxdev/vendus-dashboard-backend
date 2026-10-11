import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { mintOrganizationId, type OrganizationId } from "../../../kernel/organization-id.js";
import { problemHandler } from "../../../infra/http/problem-details.js";
import { AuditController } from "../adapters/in/audit.controller.js";
import { AuditUseCases } from "../application/use-cases/audit.use-cases.js";
import type { AuditEvent, AuditEventInput, AuditQuery, AuditRequestContext } from "../domain/entities/audit-event.js";
import type { AuditContextPort, AuditStorePort } from "../domain/ports/out/audit-store.port.js";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const express = require("express") as typeof import("express");

const ORG = mintOrganizationId("org-a");

/** Store em memória que imita o trigger (seq, data, hash encadeado). */
class FakeAuditStore implements AuditStorePort {
  events: (AuditEvent & { org: string })[] = [];
  async append(orgId: OrganizationId, e: AuditEventInput & AuditRequestContext): Promise<AuditEvent> {
    const mine = this.events.filter((x) => x.org === orgId);
    const prev = mine.at(-1);
    const ev = { ...e, org: orgId, id: `id${this.events.length + 1}`, seq: mine.length + 1, occurredAt: "2026-10-11T10:00:00Z", prevHash: prev?.hash ?? null, hash: `h${this.events.length + 1}` };
    this.events.push(ev);
    return ev;
  }
  async query(orgId: OrganizationId, q: AuditQuery): Promise<AuditEvent[]> {
    return this.events
      .filter((x) => x.org === orgId && (!q.resourceType || x.resourceType === q.resourceType) && (!q.beforeSeq || x.seq < q.beforeSeq))
      .reverse()
      .slice(0, q.limit);
  }
  async verify(): Promise<number | null> {
    return null;
  }
}

const CTX: AuditContextPort = { current: () => ({ ip: "203.0.113.7", userAgent: "Teste/1.0", correlationId: "corr-123456" }) };

describe("Auditoria transversal", () => {
  test("regista quem, o quê, antes/depois, motivo, IP, dispositivo e correlação", async () => {
    const store = new FakeAuditStore();
    const uc = new AuditUseCases(store, CTX);
    await uc.record(ORG, { actor: "admin@demo.invalid", action: "settings.value.set", resourceType: "setting_profile", resourceId: "p1", before: { v: 1 }, after: { v: 2 }, reason: "  ajuste  " });
    expect(store.events[0]).toMatchObject({
      actor: "admin@demo.invalid",
      action: "settings.value.set",
      before: { v: 1 },
      after: { v: 2 },
      reason: "ajuste",
      ip: "203.0.113.7",
      userAgent: "Teste/1.0",
      correlationId: "corr-123456",
      seq: 1,
      prevHash: null,
    });
  });

  test("recusa códigos de ação/recurso fora do formato", async () => {
    const uc = new AuditUseCases(new FakeAuditStore(), CTX);
    const base = { actor: "a", resourceId: null, before: null, after: null, reason: null };
    await expect(uc.record(ORG, { ...base, action: "Mudou Tudo", resourceType: "x_y" })).rejects.toThrow("ação");
    await expect(uc.record(ORG, { ...base, action: "a.b.c", resourceType: "Recurso!" })).rejects.toThrow("recurso");
  });

  test("consulta: limite entre 1 e 1000, datas validadas, mais recentes primeiro", async () => {
    const store = new FakeAuditStore();
    const uc = new AuditUseCases(store, CTX);
    for (let i = 0; i < 3; i++) await uc.record(ORG, { actor: "a", action: "x.y.z", resourceType: "thing", resourceId: String(i), before: null, after: null, reason: null });
    expect((await uc.list(ORG, { limit: 5000 })).map((e) => e.seq)).toEqual([3, 2, 1]);
    expect((await uc.list(ORG, { limit: 0 })).length).toBe(1);
    await expect(uc.list(ORG, { from: "11/10/2026" })).rejects.toThrow("Datas");
  });

  test("HTTP: lista, exporta CSV sem fórmulas e verifica a cadeia", async () => {
    const store = new FakeAuditStore();
    const uc = new AuditUseCases(store, CTX);
    await uc.record(ORG, { actor: "a", action: "x.y.z", resourceType: "thing", resourceId: "1", before: null, after: { v: "=1+1" }, reason: "=cmd" });
    const app = express();
    app.use((req, _res, next) => {
      req.auth = { sub: "u", email: "a", orgId: ORG, orgRole: "admin" };
      next();
    });
    app.use("/api", new AuditController(uc).router);
    app.use(problemHandler);
    const server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/novo-rh/audit`;
    try {
      expect((await (await fetch(`${base}/events?resourceType=thing`)).json())[0].seq).toBe(1);
      const csv = await (await fetch(`${base}/events.csv`)).text();
      expect(csv).toContain(`"'=cmd"`);
      expect(await (await fetch(`${base}/verify`)).json()).toEqual({ intact: true, brokenAtSeq: null });
      expect((await fetch(`${base}/events?from=ontem`)).status).toBe(400);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
