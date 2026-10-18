import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { InMemoryIdempotencyStore } from "../../../../infra/http/idempotency.js";
import { problemHandler } from "../../../../infra/http/problem-details.js";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
// O Jest corre em CommonJS sem interop: expõe o multer real como `default`.
jest.mock("multer", () => ({ __esModule: true, default: jest.requireActual("multer") }));

import { createAbsencesAdminRouter, createAbsencesMeRouter } from "../../adapters/in/absences.controller.js";
import { coverage } from "../../adapters/out/supabase-absences-directory.js";
import { AbsencesUseCases } from "../../application/use-cases/absences.use-cases.js";
import { FakeAbsencesAudit, FakeAbsencesContext, FakeAbsencesRepository, FakeNotifier, TYPE_BASE } from "../fakes/fake-absences.js";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const express = require("express") as typeof import("express");

describe("API /api/novo-rh/absences e /api/me/absences", () => {
  let server: Server;
  let base: string;
  let user = "u-admin";
  let inScope = true;
  let n = 0;
  let repo: FakeAbsencesRepository;

  beforeEach(async () => {
    user = "u-admin";
    inScope = true;
    repo = new FakeAbsencesRepository();
    const uc = new AbsencesUseCases(repo, new FakeAbsencesContext(), new FakeNotifier(), new FakeAbsencesAudit(), { today: async () => "2026-10-12" });
    const store = new InMemoryIdempotencyStore();
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.auth = { sub: user, email: `${user}@demo.invalid`, orgId: mintOrganizationId("org-a"), orgRole: "admin" };
      next();
    });
    app.use("/api", createAbsencesMeRouter(uc, store, { canPrivate: () => false }));
    app.use("/api", createAbsencesAdminRouter(uc, store, { canSeeEmployee: async () => inScope, canPrivate: () => false }));
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

  test("CF_5_http_fluxo_com_nivel_vazio_e_400_e_nao_fica_gravado", async () => {
    const r = await post("/novo-rh/absences/flows", { name: "Férias", levels: [{ people: [], roles: [] }] });
    expect(r.status).toBe(400);
    expect(repo.flows).toEqual([]);
  });

  test("RE_19_http_dia_indisponivel_e_422; RE_22_o_proprio_nao_aprova_403", async () => {
    const t = await (await post("/novo-rh/absences/types", TYPE_BASE)).json();
    user = "u-emp";
    const sunday = await post("/me/absences", { typeId: t.id, startDate: "2026-10-18" });
    expect(sunday.status).toBe(422);
    expect((await sunday.json()).type).toBe("/problems/date_unavailable");
    const ok = await (await post("/me/absences", { typeId: t.id, startDate: "2026-10-19" })).json();
    expect(ok.status).toBe("pending");
    expect((await post(`/me/approvals/${ok.id}/approve`, {})).status).toBe(403);
    user = "u-admin";
    const inbox = await (await fetch(`${base}/me/approvals`)).json();
    expect(inbox.map((x: { id: string }) => x.id)).toEqual([ok.id]);
    expect((await post(`/me/approvals/${ok.id}/approve`, {})).status).toBe(200);
  });

  test("gestão exige Idempotency-Key e âmbito do colaborador", async () => {
    expect((await post("/novo-rh/absences/types", TYPE_BASE, null)).status).toBe(400);
    inScope = false;
    expect((await fetch(`${base}/novo-rh/absences/balances?employeeId=e1`)).status).toBe(404);
  });
});

describe("Cobertura de contrato (TK-14)", () => {
  const c = (startDate: string, endDate: string | null, status = "active") => ({ startDate, endDate, seniorityDate: null, status });
  test("contratos seguidos cobrem; buraco ou contrato cancelado não", () => {
    expect(coverage([c("2025-01-01", "2025-12-31"), c("2026-01-01", null)], "2025-12-20", "2026-01-10")).toEqual({ covered: true, contractStart: "2025-01-01" });
    expect(coverage([c("2025-01-01", "2025-12-30"), c("2026-01-01", null)], "2025-12-20", "2026-01-10").covered).toBe(false);
    expect(coverage([c("2025-01-01", null, "cancelled")], "2025-06-01", "2025-06-01").covered).toBe(false);
    expect(coverage([c("2026-01-01", "2026-10-16")], "2026-10-19", "2026-10-19").covered).toBe(false);
  });
});
