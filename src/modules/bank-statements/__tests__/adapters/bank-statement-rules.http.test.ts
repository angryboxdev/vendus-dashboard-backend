import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { BankStatementController } from "../../adapters/in/bank-statement.controller.js";
import { CreateReconciliationRuleUseCase } from "../../application/use-cases/create-reconciliation-rule.use-case.js";
import { ListReconciliationRulesUseCase } from "../../application/use-cases/list-reconciliation-rules.use-case.js";
import { UpdateReconciliationRuleUseCase } from "../../application/use-cases/update-reconciliation-rule.use-case.js";
import { DeleteReconciliationRuleUseCase } from "../../application/use-cases/delete-reconciliation-rule.use-case.js";
import { FakeBankReconciliationRuleRepository } from "../fakes/fake-bank-reconciliation-rule-repository.js";
import { FakeBankMovementRepository } from "../fakes/fake-bank-movement-repository.js";
import { FakeBankStatementImportRepository } from "../fakes/fake-bank-statement-import-repository.js";

// Uploads não são testados aqui (o default import do multer não resolve no Jest em CommonJS).
jest.mock("multer", () => {
  const pass = () => (_req: unknown, _res: unknown, next: () => void) => next();
  const multer = Object.assign(() => ({ single: pass, array: pass }), { memoryStorage: () => ({}) });
  return { __esModule: true, default: multer };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const express = require("express") as typeof import("express");

const ORG = mintOrganizationId("org-a");

/**
 * «Movimentos recorrentes»: as rotas das regras têm de ganhar a `GET /bank-statements/:id` — antes,
 * `GET /bank-statements/rules` era tratado como o extrato «rules» (404) e a página ficava sempre vazia.
 */
describe("HTTP /bank-statements/rules", () => {
  let server: Server;
  let base: string;
  const getStatement = { execute: jest.fn(async () => ({ id: "s1" })) };

  beforeEach(async () => {
    const ruleRepo = new FakeBankReconciliationRuleRepository();
    const movementRepo = new FakeBankMovementRepository();
    const statementRepo = new FakeBankStatementImportRepository();
    const unused = {} as never;
    const controller = new BankStatementController(
      unused, unused, getStatement as never, unused, unused, unused, unused,
      new CreateReconciliationRuleUseCase(ruleRepo, { movementRepo, statementRepo }),
      new ListReconciliationRulesUseCase(ruleRepo, movementRepo),
      new DeleteReconciliationRuleUseCase(ruleRepo, movementRepo),
      unused, unused, unused, unused, unused, unused, unused, unused, unused, unused, unused, unused, unused, unused, unused,
      undefined, undefined,
      new UpdateReconciliationRuleUseCase(ruleRepo, { movementRepo, statementRepo }),
    );
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.auth = { sub: "u1", email: "gestor@demo.invalid", orgId: ORG, orgRole: "manager" };
      next();
    });
    app.use("/api", controller.router);
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
    getStatement.execute.mockClear();
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  const json = (body: unknown) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  it("GET /bank-statements/rules lists the rules (not the statement «rules»)", async () => {
    const created = await fetch(`${base}/bank-statements/rules`, json({
      name: "Compras Amazon",
      descriptionContains: "MDB9880 WWW.AMAZON* 70.24EUR",
      justificationType: "recibo_comprovativo",
      movementType: "debit",
      bankAccountId: "acc-1",
    }));
    expect(created.status).toBe(201);

    const res = await fetch(`${base}/bank-statements/rules`);
    expect(res.status).toBe(200);
    const list = (await res.json()) as Array<{ name: string; usage: unknown }>;
    expect(list.map((r) => r.name)).toEqual(["Compras Amazon"]);
    expect(list[0]!.usage).toEqual({ movementsCount: 0, lastBookingDate: null });
    expect(getStatement.execute).not.toHaveBeenCalled();
  });

  it("PATCH /bank-statements/rules/:id pauses a rule", async () => {
    const created = (await (await fetch(`${base}/bank-statements/rules`, json({
      name: "Tarifa", descriptionContains: "TARIFA MENSAL", justificationType: "despesa_bancaria_automatica", bankAccountId: "acc-1",
    }))).json()) as { id: string };
    const res = await fetch(`${base}/bank-statements/rules/${created.id}`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ isActive: false }),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { isActive: boolean }).isActive).toBe(false);
  });

  it("GET /bank-statements/:id still reaches the statement", async () => {
    const res = await fetch(`${base}/bank-statements/s1`);
    expect(res.status).toBe(200);
    expect(getStatement.execute).toHaveBeenCalledTimes(1);
  });
});
