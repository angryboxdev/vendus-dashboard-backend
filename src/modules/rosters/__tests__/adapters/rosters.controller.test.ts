import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { InMemoryIdempotencyStore } from "../../../../infra/http/idempotency.js";
import { problemHandler } from "../../../../infra/http/problem-details.js";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { createRostersRouter } from "../../adapters/in/rosters.controller.js";
import { CoverageUseCases } from "../../application/use-cases/coverage.use-cases.js";
import { RostersUseCases } from "../../application/use-cases/rosters.use-cases.js";
import { rulesFromSettings } from "../../rosters.module.js";
import { FakeCoverageContext, FakeCoverageRules, FakePublishedHook, FakeRostersAudit, FakeRostersContext, FakeRostersNotifier, FakeRostersRepository, NO_RULES } from "../fakes/fake-rosters.js";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const express = require("express") as typeof import("express");

describe("API /api/novo-rh/rosters", () => {
  let server: Server;
  let base: string;
  let n = 0;
  let ctx: FakeRostersContext;
  let cov: FakeCoverageContext;

  beforeEach(async () => {
    ctx = new FakeRostersContext();
    cov = new FakeCoverageContext();
    const repo = new FakeRostersRepository();
    const uc = new RostersUseCases(repo, ctx, new FakeRostersNotifier(), new FakePublishedHook(), new FakeRostersAudit());
    const coverage = new CoverageUseCases(new FakeCoverageRules(), repo, cov, new FakeRostersAudit());
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.auth = { sub: "u-boss", email: "gestora@demo.invalid", orgId: mintOrganizationId("org-a"), orgRole: "admin" };
      next();
    });
    app.use("/api", createRostersRouter(uc, new InMemoryIdempotencyStore(), async () => true, coverage));
    app.use(problemHandler);
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/novo-rh/rosters`;
  });
  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const send = (method: string, path: string, body: unknown) =>
    fetch(`${base}${path}`, { method, headers: { "content-type": "application/json", "Idempotency-Key": `k-${++n}` }, body: JSON.stringify(body) });

  test("RE_15_http_modelo_vazio_e_400_campo_obrigatorio", async () => {
    const r = await send("POST", "/templates", { name: "", abbreviation: "", segments: [{ start: "16:00", end: "22:00" }] });
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({ detail: "Campo obrigatório", field: "name" });
  });

  test("RE_16_http_bloqueio_422_com_violacoes; aviso_409_e_confirmar_publica; TK_16_motivo", async () => {
    const roster = await (await send("POST", "", { name: "Loja", targetType: "location", targetId: "11111111-1111-4111-8111-111111111111" })).json();
    await send("POST", `/${roster.id}/shifts`, { employeeId: "e1", workDate: "2026-10-19", segments: [{ start: "16:00", end: "22:00" }] });
    const created = await (await send("POST", `/${roster.id}/shifts`, { employeeId: "e1", workDate: "2026-10-20", segments: [{ start: "06:00", end: "12:00" }] })).json();
    ctx.rules_ = { ...NO_RULES, minRestMinutes: 720, restSeverity: "block" };
    const blocked = await send("POST", `/${roster.id}/publish`, { confirm: true });
    expect(blocked.status).toBe(422);
    expect((await blocked.json()).violations[0]).toMatchObject({ rule: "min_rest", workDate: "2026-10-20" });
    ctx.rules_ = { ...ctx.rules_, restSeverity: "warning" };
    expect((await send("POST", `/${roster.id}/publish`, {})).status).toBe(409);
    expect((await send("POST", `/${roster.id}/publish`, { confirm: true })).status).toBe(200);
    expect((await send("PATCH", `/shifts/${created.shift.id}`, { segments: [{ start: "10:00", end: "14:00" }] })).status).toBe(400);
    const changed = await send("PATCH", `/shifts/${created.shift.id}`, { segments: [{ start: "10:00", end: "14:00" }], reason: "Entrada mais tarde", confirm: true });
    expect(changed.status).toBe(200);
    expect((await changed.json()).publication.version).toBe(2);
    const history = await (await fetch(`${base}/${roster.id}/history`)).json();
    expect(history.map((h: { version: number }) => h.version)).toEqual([2, 1]);
  });

  test("turno sobreposto em rascunho é 422 com a violação; GET /summary dá a visão macro", async () => {
    const roster = await (await send("POST", "", { name: "Loja", targetType: "location", targetId: "11111111-1111-4111-8111-111111111111" })).json();
    expect((await send("POST", `/${roster.id}/shifts`, { employeeId: "e1", workDate: "2026-10-19", segments: [{ start: "10:00", end: "20:00" }] })).status).toBe(201);
    const dup = await send("POST", `/${roster.id}/shifts`, { employeeId: "e1", workDate: "2026-10-19", segments: [{ start: "10:00", end: "20:00" }] });
    expect(dup.status).toBe(422);
    expect((await dup.json()).violations[0]).toMatchObject({ rule: "overlap", employeeId: "e1", workDate: "2026-10-19" });
    const summary = await (await fetch(`${base}/summary?from=2026-10-19&to=2026-10-25`)).json();
    expect(summary).toEqual([expect.objectContaining({ roster: expect.objectContaining({ id: roster.id }), employeeIds: ["e1"], pending: 1 })]);
    expect((await fetch(`${base}/summary?from=x&to=y`)).status).toBe(400);
  });

  test("POST /:id/clear-pending retira os pendentes numa só chamada; POST /:id/shifts/restore repõe-os", async () => {
    const roster = await (await send("POST", "", { name: "Loja", targetType: "location", targetId: "11111111-1111-4111-8111-111111111111" })).json();
    await send("POST", `/${roster.id}/shifts`, { employeeId: "e1", workDate: "2026-10-19", segments: [{ start: "10:00", end: "14:00" }] });
    await send("POST", `/${roster.id}/shifts`, { employeeId: "e1", workDate: "2026-10-20", segments: [{ start: "10:00", end: "14:00" }] });
    const cleared = await send("POST", `/${roster.id}/clear-pending`, { employeeId: "e1", from: "2026-10-19", to: "2026-10-25" });
    expect(cleared.status).toBe(200);
    const { removed } = await cleared.json();
    expect(removed).toHaveLength(2);
    const restored = await send("POST", `/${roster.id}/shifts/restore`, { shiftIds: removed.map((r: { id: string }) => r.id) });
    expect((await restored.json()).restored).toHaveLength(2);
  });

  test("Plano de Cobertura: estado, regras (desligado → 409) e cobertura da escala", async () => {
    const PORTO = "11111111-1111-4111-8111-111111111111";
    cov.on = false;
    expect(await (await fetch(`${base}/coverage/status`)).json()).toEqual({ enabled: false });
    expect((await send("POST", "/coverage/rules", { locationId: PORTO, weekday: 1, start: "09:00", end: "17:00", minPeople: 2 })).status).toBe(409);
    expect(await (await send("PUT", "/coverage/status", { enabled: true })).json()).toEqual({ enabled: true });
    expect(cov.on).toBe(true);
    expect((await send("POST", "/coverage/rules", { locationId: PORTO, weekday: 1, start: "09:00", end: "09:00", minPeople: 2 })).status).toBe(400);
    const created = await send("POST", "/coverage/rules", { locationId: PORTO, weekday: 1, start: "09:00", end: "17:00", minPeople: 2 });
    expect(created.status).toBe(201);
    const rule = await created.json();
    expect(rule).toMatchObject({ areaId: null, weekday: 1, date: null, minPeople: 2 });
    expect((await send("PATCH", `/coverage/rules/${rule.id}`, { minPeople: 1 })).status).toBe(200);
    expect(await (await fetch(`${base}/coverage/rules?locationId=${PORTO}`)).json()).toEqual([{ ...rule, minPeople: 1 }]);
    const roster = await (await send("POST", "", { name: "Loja", targetType: "location", targetId: PORTO })).json();
    await send("POST", `/${roster.id}/shifts`, { employeeId: "e1", workDate: "2026-11-02", segments: [{ start: "09:00", end: "17:00" }] });
    const report = await (await fetch(`${base}/${roster.id}/coverage?from=2026-11-02&to=2026-11-02`)).json();
    expect(report).toMatchObject({ enabled: true, locationId: PORTO, days: [{ date: "2026-11-02", areaId: null, status: "ok", windows: [{ required: 1, planned: 1, published: 0 }] }] });
    expect((await send("DELETE", `/coverage/rules/${rule.id}`, {})).status).toBe(200);
  });
});

describe("Parâmetros → regras das escalas", () => {
  test("sem valores legais nada se aplica; severidades por omissão em aviso", () => {
    expect(rulesFromSettings([])).toEqual(NO_RULES);
    expect(rulesFromSettings([{ key: "legal.rest.min_minutes_between_workdays", value: 720 }, { key: "time_tracking.roster.rest_severity", value: "block" }])).toMatchObject({ minRestMinutes: 720, restSeverity: "block" });
  });
});
