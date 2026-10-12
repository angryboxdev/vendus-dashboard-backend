import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { InMemoryIdempotencyStore } from "../../../../infra/http/idempotency.js";
import { problemHandler } from "../../../../infra/http/problem-details.js";
import { SettingsController } from "../../adapters/in/settings.controller.js";
import { SettingsUseCases } from "../../application/use-cases/settings.use-cases.js";
import { SETTING_CATALOG } from "../../domain/services/setting-catalog.js";
import { FakeAudit, FakeClock, FakeImpact, FakeSegments, FakeSettingsRepository } from "../fakes/fake-settings.js";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const express = require("express") as typeof import("express");

const TOL = "time_tracking.tolerance.minutes";

describe("API /api/novo-rh/settings", () => {
  let server: Server;
  let base: string;
  let retro = false;
  let n = 0;

  beforeEach(async () => {
    retro = false;
    const uc = new SettingsUseCases(new FakeSettingsRepository(), new FakeSegments(), new FakeImpact(4), new FakeClock("2026-10-11"), SETTING_CATALOG, new FakeAudit());
    const controller = new SettingsController(uc, new InMemoryIdempotencyStore(), () => ({ userId: "admin@demo.invalid", canRetroactive: retro }));
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.auth = { sub: "u1", email: "admin@demo.invalid", orgId: mintOrganizationId("org-a"), orgRole: "admin" };
      next();
    });
    app.use("/api", controller.router);
    app.use(problemHandler);
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/novo-rh/settings`;
  });
  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(`${base}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "Idempotency-Key": `k-${++n}`, ...headers },
      body: JSON.stringify(body),
    });

  async function globalProfile(domain = "time_tracking") {
    const p = await (await post("/profiles", { domain, name: `Global ${domain}`, kind: "global" })).json();
    const etag = (await fetch(`${base}/profiles/${p.id}`)).headers.get("etag")!;
    return { id: p.id as string, etag };
  }

  test("TK_6_http_valor_futuro_nao_muda_hoje_e_retroativo_sem_permissao_e_403", async () => {
    const g = await globalProfile();
    const r1 = await post(`/profiles/${g.id}/values`, { key: TOL, value: 15, validFrom: "2026-11-01", reason: "nova regra" }, { "If-Match": g.etag });
    expect(r1.status).toBe(201);
    const eff = await (await fetch(`${base}/effective?employeeId=e1&date=2026-10-11`)).json();
    expect(eff.find((s: { key: string }) => s.key === TOL).value).toBe(0);

    const etag2 = r1.headers.get("etag")!;
    const past = await post(`/profiles/${g.id}/values`, { key: TOL, value: 5, validFrom: "2026-10-01", reason: "corrigir" }, { "If-Match": etag2 });
    expect(past.status).toBe(403);
    expect((await past.json()).type).toBe("/problems/retroactive_not_allowed");

    retro = true;
    const ok = await post(`/profiles/${g.id}/values`, { key: TOL, value: 5, validFrom: "2026-10-01", reason: "corrigir" }, { "If-Match": etag2 });
    expect(ok.status).toBe(201);
    expect((await ok.json()).impact).toEqual({ employees: 4, pastDays: 10, validFrom: "2026-10-01" });
  });

  test("TK_7_http_dependencia_em_falta_devolve_422_rule_violation", async () => {
    const g = await globalProfile("notifications");
    const res = await post(`/profiles/${g.id}/values`, { key: "notifications.auto_close_warning.enabled", value: true, validFrom: "2026-10-11", reason: "ativar" }, { "If-Match": g.etag });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({
      type: "/problems/rule_violation",
      requires: { key: "time_tracking.auto_close.enabled", equals: true },
    });
  });

  test("alteração com versão desatualizada → 412; sem If-Match → 428", async () => {
    const g = await globalProfile();
    await post(`/profiles/${g.id}/values`, { key: TOL, value: 10, validFrom: "2026-10-11", reason: "a" }, { "If-Match": g.etag });
    const stale = await post(`/profiles/${g.id}/values`, { key: TOL, value: 12, validFrom: "2026-10-11", reason: "b" }, { "If-Match": g.etag });
    expect(stale.status).toBe(412);
    const missing = await post(`/profiles/${g.id}/values`, { key: TOL, value: 12, validFrom: "2026-10-11", reason: "b" });
    expect(missing.status).toBe(428);
  });

  test("CF_12_historico_exportavel_em_csv_com_antes_depois_e_motivo", async () => {
    const g = await globalProfile();
    const r = await post(`/profiles/${g.id}/values`, { key: TOL, value: 10, validFrom: "2026-10-11", reason: "inicial" }, { "If-Match": g.etag });
    await post(`/profiles/${g.id}/values`, { key: TOL, value: 12, validFrom: "2026-10-12", reason: "=ajuste" }, { "If-Match": r.headers.get("etag")! });
    const csv = await fetch(`${base}/history.csv?key=${TOL}`);
    expect(csv.headers.get("content-type")).toContain("text/csv");
    const text = await csv.text();
    expect(text).toContain('"Antes";"Depois";"Data de efeito";"Motivo"');
    expect(text).toContain('"10";"12";"2026-10-12";"\'=ajuste"');
  });

  test("criar perfil sem Idempotency-Key → 400; nome repetido → 400 com o campo", async () => {
    const noKey = await fetch(`${base}/profiles`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ domain: "security", name: "X", kind: "global" }) });
    expect(noKey.status).toBe(400);
    await post("/profiles", { domain: "security", name: "Segurança", kind: "global" });
    const dup = await post("/profiles", { domain: "security", name: "segurança", kind: "segment" });
    expect(dup.status).toBe(400);
    expect((await dup.json()).field).toBe("name");
  });
});
