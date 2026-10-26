import { describe, it, expect, beforeEach } from "@jest/globals";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { GetAccountCalendarUseCase } from "../../application/use-cases/get-account-calendar.use-case.js";
import { FakeBankMovementRepository } from "../fakes/fake-bank-movement-repository.js";
import { FakeBankStatementImportRepository } from "../fakes/fake-bank-statement-import-repository.js";
import { BankMovement } from "../../domain/entities/bank-movement.js";
import { BankStatementImport } from "../../domain/entities/bank-statement-import.js";

const organizationId = mintOrganizationId("org-a");
const ACCOUNT_ID = "acc-001";

let seq = 0;
function mov(date: string, movementType: "debit" | "credit", amount: number, balanceAfter: number, resolved = false): BankMovement {
  const m = BankMovement.create({
    bankAccountId: ACCOUNT_ID,
    statementImportId: "stmt-1",
    bookingDate: new Date(`${date}T00:00:00.000Z`),
    valueDate: new Date(`${date}T00:00:00.000Z`),
    description: "Movimento de teste",
    amount,
    balanceAfter,
    movementType,
    deduplicationHash: `h-${seq++}`,
  });
  return resolved ? m.classify({ justificationType: "transferencia_interna", riskLevel: "low", requiresDocument: false }) : m;
}

function statement(start: string, end: string) {
  return BankStatementImport.create({
    bankAccountId: ACCOUNT_ID,
    bankName: "Banco Fictício",
    accountNumber: "000111222",
    periodStart: new Date(`${start}T00:00:00.000Z`),
    periodEnd: new Date(`${end}T00:00:00.000Z`),
    sourceType: "csv",
    openingBalance: 0,
    closingBalance: 0,
  });
}

describe("GetAccountCalendarUseCase — V2 (estado do extrato, conciliação real, fluxo de caixa)", () => {
  let movementRepo: FakeBankMovementRepository;
  let statementRepo: FakeBankStatementImportRepository;
  let useCase: GetAccountCalendarUseCase;
  const month = async (n: number) => (await useCase.execute({ organizationId, bankAccountId: ACCOUNT_ID, year: 2026 })).find((m) => m.month === n)!;

  beforeEach(() => {
    movementRepo = new FakeBankMovementRepository();
    statementRepo = new FakeBankStatementImportRepository();
    useCase = new GetAccountCalendarUseCase(movementRepo, statementRepo);
  });

  it("mês sem extrato: «Sem extrato», sem percentagem e sem valores inventados", async () => {
    const jan = await month(1);
    expect(jan).toMatchObject({ statementImported: false, status: "no_statement", reconciledPercent: null, totalMovements: 0, openingBalanceCents: null, closingBalanceCents: null });
  });

  it("extrato importado sem movimentos no mês: «Importado», sem percentagem", async () => {
    await statementRepo.save(organizationId, statement("2026-02-01", "2026-02-28"));
    expect(await month(2)).toMatchObject({ statementImported: true, status: "imported", reconciledPercent: null });
  });

  it("importado e ainda sem conciliação: 0% e fluxo de caixa correto (créditos aceites não contam para a %)", async () => {
    await statementRepo.save(organizationId, statement("2026-09-01", "2026-09-30"));
    await movementRepo.saveBulk(organizationId, [
      mov("2026-09-01", "credit", 36_908, 531_904), // saldo antes 495 000 (4 950,00 €)
      mov("2026-09-01", "debit", 1_230, 530_674),
      mov("2026-09-02", "debit", 5_015, 525_659),
    ]);
    expect(await month(9)).toMatchObject({
      status: "imported",
      reconcilableMovements: 2,
      reconciledPercent: 0,
      inflowCents: 36_908,
      outflowCents: 6_245,
      netCents: 30_663,
      openingBalanceCents: 495_000 - 4, // 531 904 − 36 908
      closingBalanceCents: 525_659,
    });
  });

  it("parcialmente conciliado → %; tudo conciliado → «Conciliado» 100%", async () => {
    await movementRepo.saveBulk(organizationId, [mov("2026-07-01", "debit", 100, 900, true), mov("2026-07-02", "debit", 100, 800), mov("2026-08-01", "debit", 100, 700, true)]);
    expect(await month(7)).toMatchObject({ status: "partial", reconciledPercent: 50 });
    expect(await month(8)).toMatchObject({ status: "reconciled", reconciledPercent: 100 });
  });

  it("só entradas aceites automaticamente: «Não aplicável» (null) e «Importado», nunca 100%/«Conciliado»", async () => {
    await statementRepo.save(organizationId, statement("2026-05-01", "2026-05-31"));
    await movementRepo.saveBulk(organizationId, [mov("2026-05-03", "credit", 5_000, 105_000), mov("2026-05-04", "credit", 2_000, 107_000)]);
    expect(await month(5)).toMatchObject({ status: "imported", reconcilableMovements: 0, reconciledPercent: null, totalMovements: 2 });
  });

  it("período parcial: extrato só de parte do mês; meses inteiros (mesmo com extratos sobrepostos) não", async () => {
    await statementRepo.save(organizationId, statement("2026-09-15", "2026-09-30"));
    await statementRepo.save(organizationId, statement("2026-10-01", "2026-10-20"));
    await statementRepo.save(organizationId, statement("2026-10-15", "2026-10-31"));
    expect(await month(9)).toMatchObject({ statementImported: true, partialPeriod: true });
    expect(await month(10)).toMatchObject({ statementImported: true, partialPeriod: false });
    expect(await month(11)).toMatchObject({ statementImported: false, partialPeriod: false });
  });

  it("saldo inicial e final pela cadeia de saldos, mesmo com a ordem do dia trocada", async () => {
    await movementRepo.saveBulk(organizationId, [mov("2026-06-05", "debit", 300, 1_700), mov("2026-06-05", "credit", 1_000, 2_000), mov("2026-06-06", "debit", 200, 1_500)]);
    // ordem real: +1000 (1000→2000), −300 (→1700), −200 (→1500)
    expect(await month(6)).toMatchObject({ openingBalanceCents: 1_000, closingBalanceCents: 1_500 });
  });
});
