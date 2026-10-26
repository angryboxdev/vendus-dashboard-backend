import { describe, it, expect, beforeEach } from "@jest/globals";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { ImportBankStatementUseCase } from "../../application/use-cases/import-bank-statement.use-case.js";
import { FakeBankStatementImportRepository } from "../fakes/fake-bank-statement-import-repository.js";
import { FakeBankMovementRepository } from "../fakes/fake-bank-movement-repository.js";
import type { ImportBankStatementCommand } from "../../domain/ports/in/bank-statement.ports.js";
import type { StatementAccountHints, StatementAccountResolverPort } from "../../domain/ports/out/statement-account-resolver.port.js";

const organizationId = mintOrganizationId("org-a");
// Dados fictícios.
const hints: StatementAccountHints = { template: "millennium_pdf", bankName: "Millennium BCP", bic: "BCOMPTPL", iban: "PT50003300001234567890101", accountNumber: "12345678901", accountLabel: "CONTA NEGOCIO EMP." };
const command: ImportBankStatementCommand = {
  organizationId,
  bankName: "Millennium BCP",
  accountNumber: "12345678901",
  periodStart: new Date("2026-09-01T00:00:00.000Z"),
  periodEnd: new Date("2026-09-30T00:00:00.000Z"),
  sourceType: "pdf",
  openingBalance: 100_000,
  closingBalance: 99_500,
  movements: [{ bookingDate: new Date("2026-09-02T00:00:00.000Z"), valueDate: new Date("2026-09-02T00:00:00.000Z"), description: "TARIFA", amount: 500, balanceAfter: 99_500, movementType: "debit" }],
  autoAccount: hints,
};

describe("ImportBankStatementUseCase — banco/conta automáticos (V2 F3)", () => {
  let movementRepo: FakeBankMovementRepository;
  let calls: { create: boolean; hints: StatementAccountHints }[];
  let resolver: StatementAccountResolverPort;
  let useCase: ImportBankStatementUseCase;

  beforeEach(() => {
    movementRepo = new FakeBankMovementRepository();
    calls = [];
    resolver = {
      resolve: async (_org, h, { create }) => {
        calls.push({ create, hints: h });
        return { status: "created", bankId: "bank-1", bankName: "Millennium BCP", bankIsNew: true, accountId: "acc-1", accountName: "Conta Negocio Emp." };
      },
    };
    useCase = new ImportBankStatementUseCase(new FakeBankStatementImportRepository(), movementRepo, undefined, resolver);
  });

  it("sem conta escolhida: cria/encontra a conta pelo extrato e liga-lhe os movimentos", async () => {
    const r = await useCase.execute(command);
    expect(calls).toEqual([{ create: true, hints }]);
    expect(r).toMatchObject({ bankAccountId: "acc-1", accountMatched: true, accountResolution: { status: "created", bankIsNew: true } });
    const movements = await movementRepo.findByStatementId(organizationId, r.id);
    expect(movements.every((m) => m.bankAccountId === "acc-1")).toBe(true);
  });

  it("com a conta escolhida no ecrã, não cria nada", async () => {
    const r = await useCase.execute({ ...command, bankAccountId: "acc-escolhida" });
    expect(calls).toHaveLength(0);
    expect(r.bankAccountId).toBe("acc-escolhida");
    expect(r.accountResolution).toBeUndefined();
  });
});
