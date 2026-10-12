import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { InMemoryIdempotencyStore } from "../../../../infra/http/idempotency.js";
import { problemHandler } from "../../../../infra/http/problem-details.js";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { createTimeBankRouter } from "../../adapters/in/time-bank.controller.js";
import { bankSettingsFrom } from "../../adapters/out/settings-bank.js";
import { TimeBankUseCases } from "../../application/use-cases/time-bank.use-cases.js";
import { FakeTimeBankAudit, FakeTimeBankContext, FakeTimeBankRepository } from "../fakes/fake-time-bank.js";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const express = require("express") as typeof import("express");

describe("API /api/novo-rh/time-bank", () => {
  let server: Server;
  let base: string;
  let inScope = true;
  let n = 0;
  let ctx: FakeTimeBankContext;

  beforeEach(async () => {
    inScope = true;
    ctx = new FakeTimeBankContext();
    const uc = new TimeBankUseCases(new FakeTimeBankRepository(), ctx, new FakeTimeBankAudit());
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.auth = { sub: "u-boss", email: "gestora@demo.invalid", orgId: mintOrganizationId("org-a"), orgRole: "admin" };
      next();
    });
    app.use("/api", createTimeBankRouter(uc, new InMemoryIdempotencyStore(), async () => inScope));
    app.use(problemHandler);
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  });
  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const post = (path: string, body: unknown) =>
    fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json", "Idempotency-Key": `k-${++n}` }, body: JSON.stringify(body) });

  test("RE_28_http_compensar_acima_do_saldo_e_422_com_o_disponivel", async () => {
    ctx.excess.set("2026-09-29", 3600);
    const r = await post("/novo-rh/time-bank/employees/e1/compensate", { mode: "rest", seconds: 9 * 3600, reason: "Folga" });
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({ type: "/problems/exceeds_balance", availableSeconds: 3600 });
    const ledger = await (await fetch(`${base}/novo-rh/time-bank/employees/e1`)).json();
    expect(ledger).toMatchObject({ cutoff: "2026-09-30", balance: 3600 });
  });

  test("âmbito e histórico do colaborador desligado por omissão", async () => {
    inScope = false;
    expect((await fetch(`${base}/novo-rh/time-bank/employees/e1`)).status).toBe(404);
    expect((await fetch(`${base}/me/time-bank`)).status).toBe(422);
  });
});

describe("Parâmetros → regras do banco", () => {
  test("por omissão: mês vencido, sem limites nem expiração (D11)", () => {
    expect(bankSettingsFrom([])).toEqual({
      period: "closed_month",
      excessValidation: false,
      compensateBeyondBalance: false,
      paidAnnualLimitHours: null,
      paidAfterLimit: false,
      expiryDays: null,
      holidayMode: "leave_days",
      employeeSeesHistory: false,
    });
    expect(bankSettingsFrom([{ key: "time_tracking.bank.expiry_days", value: 720 }, { key: "time_tracking.bank.period", value: "until_yesterday" }])).toMatchObject({ expiryDays: 720, period: "until_yesterday" });
  });
});
