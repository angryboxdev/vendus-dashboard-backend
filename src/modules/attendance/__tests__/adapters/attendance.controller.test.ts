import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { InMemoryIdempotencyStore } from "../../../../infra/http/idempotency.js";
import { problemHandler } from "../../../../infra/http/problem-details.js";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { createAttendanceAdminRouter, createAttendanceMeRouter } from "../../adapters/in/attendance.controller.js";
import { configFromSettings } from "../../adapters/out/settings-config.js";
import { AttendanceUseCases } from "../../application/use-cases/attendance.use-cases.js";
import { FakeAttendanceRepository, FakeAudit, FakeBackground, FakeClockNow, FakeContext } from "../fakes/fake-attendance.js";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const express = require("express") as typeof import("express");

describe("API /api/me/clock e /api/novo-rh/attendance", () => {
  let server: Server;
  let base: string;
  let user = "u-emp";
  let inScope = true;
  let n = 0;
  let ctx: FakeContext;
  let repo: FakeAttendanceRepository;

  beforeEach(async () => {
    user = "u-emp";
    inScope = true;
    repo = new FakeAttendanceRepository();
    ctx = new FakeContext();
    const uc = new AttendanceUseCases(repo, ctx, new FakeAudit(), new FakeClockNow("2026-10-12T09:00:00.000Z"), new FakeBackground());
    const store = new InMemoryIdempotencyStore();
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.auth = { sub: user, email: `${user}@demo.invalid`, orgId: mintOrganizationId("org-a"), orgRole: "admin" };
      next();
    });
    app.use("/api", createAttendanceMeRouter(uc, store));
    app.use("/api", createAttendanceAdminRouter(uc, store, async () => inScope));
    app.use(problemHandler);
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  });
  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const post = (path: string, body: unknown, key: string | null = `k-${++n}`) =>
    fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json", ...(key ? { "Idempotency-Key": key } : {}) }, body: JSON.stringify(body) });

  test("RE_9_http_marcacao_repetida_responde_200_com_a_mesma", async () => {
    const r1 = await post("/me/clock", { segmentType: "work", clientEventId: "c-1" }, null);
    expect(r1.status).toBe(201);
    const r2 = await post("/me/clock", { segmentType: "work", clientEventId: "c-1" }, null);
    expect(r2.status).toBe(200);
    expect((await r2.json()).event.id).toBe((await r1.json()).event.id);
    const me = await (await fetch(`${base}/me/clock`)).json();
    expect(me.state).toBe("work");
    // A vista não expõe IP nem coordenadas.
    const days = await (await fetch(`${base}/me/clock/days?from=2026-10-12&to=2026-10-12`)).json();
    expect(days.events[0]).not.toHaveProperty("ip");
    expect(days.events[0]).not.toHaveProperty("latitude");
  });

  test("marcação recusada por regra → 422 com o código", async () => {
    ctx.config_.policy.ipAllowlist = ["203.0.113.9"];
    const r = await post("/me/clock", { segmentType: "work" });
    expect(r.status).toBe(422);
    expect((await r.json()).type).toBe("/problems/ip_not_allowed");
  });

  test("RE_10_http_correcao_sem_motivo_e_400", async () => {
    user = "u-boss";
    const r = await post("/novo-rh/attendance/revisions", { employeeId: "e1", operation: "add", occurredAt: "2026-10-10T08:00:00.000Z", segmentType: "work", reason: "" });
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({ type: "/problems/validation_error", field: "reason" });
    const ok = await post("/novo-rh/attendance/revisions", { employeeId: "e1", operation: "add", occurredAt: "2026-10-10T08:00:00.000Z", segmentType: "work", reason: "Esqueceu-se" });
    expect(ok.status).toBe(201);
  });

  test("gestão exige Idempotency-Key, âmbito e não deixa corrigir o próprio registo", async () => {
    user = "u-boss";
    expect((await post("/novo-rh/attendance/revisions", { employeeId: "e1" }, null)).status).toBe(400);
    const own = await post("/novo-rh/attendance/revisions", { employeeId: "e9", operation: "add", occurredAt: "2026-10-10T08:00:00.000Z", segmentType: "work", reason: "x" });
    expect(own.status).toBe(403);
    inScope = false;
    expect((await fetch(`${base}/novo-rh/attendance/days?employeeId=e1&from=2026-10-01&to=2026-10-07`)).status).toBe(404);
  });

  test("pedido de correção do colaborador e decisão da gestão", async () => {
    const c = await (await post("/me/clock/corrections", { operation: "add", occurredAt: "2026-10-10T08:00:00.000Z", segmentType: "work", reason: "Sem rede" })).json();
    expect(c.status).toBe("pending");
    expect((await post(`/novo-rh/attendance/corrections/${c.id}/approve`, {})).status).toBe(403);
    user = "u-boss";
    const list = await (await fetch(`${base}/novo-rh/attendance/corrections?status=pending`)).json();
    expect(list.map((x: { id: string }) => x.id)).toEqual([c.id]);
    const d = await post(`/novo-rh/attendance/corrections/${c.id}/approve`, {});
    expect(d.status).toBe(200);
    expect(repo.revisions).toHaveLength(1);
  });

  test("incidentes: listar e validar com comentário", async () => {
    await repo.ensureIncidents(mintOrganizationId("org-a"), [{ employeeId: "e1", workDate: "2026-10-08", type: "missing_out" }]);
    user = "u-boss";
    const list = await (await fetch(`${base}/novo-rh/attendance/incidents?from=2026-10-01&to=2026-10-11&status=open`)).json();
    expect(list).toHaveLength(1);
    expect((await post(`/novo-rh/attendance/incidents/${list[0].id}/resolve`, { resolution: "validate" })).status).toBe(400);
    expect((await post(`/novo-rh/attendance/incidents/${list[0].id}/resolve`, { resolution: "validate", comment: "Confirmado" })).status).toBe(200);
  });
});

describe("Parâmetros → regras do motor", () => {
  test("sem valores, tudo desligado e nada legal inventado", () => {
    const c = configFromSettings([], "Europe/Lisbon");
    expect(c.rules).toMatchObject({ nightStart: null, nightEnd: null, continuityMinutes: null, toleranceMinutes: 0, maxOpenHours: 16, incidentHoursCount: false, autoClose: false });
    expect(c.policy).toEqual({ ipAllowlist: [], blockBeforeStartMinutes: null, requireCoordinates: false, blockOutsideGeofence: false });
    expect(c.refusal).toEqual({ enabled: false, hours: 48 });
  });

  test("CF_1_tolerancia_e_regras_vindas_dos_parametros", () => {
    const c = configFromSettings(
      [
        { key: "time_tracking.tolerance.minutes", value: 10 },
        { key: "time_tracking.night_shift.rule", value: "continuity_margin" },
        { key: "time_tracking.night_shift.continuity_minutes", value: 120 },
        { key: "legal.night.start", value: "22:00" },
        { key: "legal.night.end", value: "07:00" },
        { key: "time_tracking.ip_allowlist", value: ["10.0.0.1"] },
        { key: "time_tracking.correction.employee_can_refuse", value: true },
        { key: "time_tracking.correction.refusal_hours", value: 24 },
      ],
      "Europe/Madrid",
    );
    expect(c.rules).toMatchObject({ timeZone: "Europe/Madrid", toleranceMinutes: 10, nightRule: "continuity_margin", continuityMinutes: 120, nightStart: "22:00", nightEnd: "07:00" });
    expect(c.policy.ipAllowlist).toEqual(["10.0.0.1"]);
    expect(c.refusal).toEqual({ enabled: true, hours: 24 });
  });
});
