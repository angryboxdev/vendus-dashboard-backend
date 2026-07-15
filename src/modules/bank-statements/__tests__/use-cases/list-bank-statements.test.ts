import { describe, it, expect, beforeEach } from "@jest/globals";
import { ListBankStatementsUseCase } from "../../application/use-cases/list-bank-statements.use-case.js";
import { BankStatementImport } from "../../domain/entities/bank-statement-import.js";
import { FakeBankStatementImportRepository } from "../fakes/fake-bank-statement-import-repository.js";

function makeStatement(overrides: Partial<Parameters<typeof BankStatementImport.create>[0]> = {}) {
  return BankStatementImport.create({
    bankName: "Millennium BCP",
    accountNumber: "1234-5678",
    periodStart: new Date("2026-07-01"),
    periodEnd: new Date("2026-07-31"),
    sourceType: "csv",
    openingBalance: 100_000,
    closingBalance: 95_000,
    ...overrides,
  });
}

describe("ListBankStatementsUseCase", () => {
  let repo: FakeBankStatementImportRepository;
  let useCase: ListBankStatementsUseCase;

  beforeEach(() => {
    repo = new FakeBankStatementImportRepository();
    useCase = new ListBankStatementsUseCase(repo);
  });

  it("returns empty array when no statements exist", async () => {
    const result = await useCase.execute();
    expect(result).toHaveLength(0);
  });

  it("returns summaries for all statements", async () => {
    await repo.save(makeStatement({ bankName: "Millennium BCP" }));
    await repo.save(makeStatement({ bankName: "Caixa Geral", accountNumber: "9876-5432" }));

    const result = await useCase.execute();
    expect(result).toHaveLength(2);
    expect(result.map((s) => s.bankName)).toEqual(
      expect.arrayContaining(["Millennium BCP", "Caixa Geral"])
    );
  });

  it("summary includes required fields", async () => {
    await repo.save(makeStatement());

    const [summary] = await useCase.execute();
    expect(summary).toMatchObject({
      bankName: "Millennium BCP",
      accountNumber: "1234-5678",
      status: "draft",
      openingBalance: 100_000,
      closingBalance: 95_000,
      reconciliationProgress: 0,
    });
    expect(summary!.id).toBeDefined();
    expect(summary!.createdAt).toBeInstanceOf(Date);
  });

  it("filters by accountNumber", async () => {
    await repo.save(makeStatement({ accountNumber: "111" }));
    await repo.save(makeStatement({ accountNumber: "222" }));

    const result = await useCase.execute({ accountNumber: "111" });
    expect(result).toHaveLength(1);
    expect(result[0]!.accountNumber).toBe("111");
  });

  it("filters by status", async () => {
    const s1 = makeStatement();
    // s1 is draft; s2 will be in_review after updateStats
    const s2 = makeStatement({ accountNumber: "999" }).updateStats({
      importedMovementsCount: 1,
      calculatedClosingBalance: 95_000,
      reconciliationProgress: 0,
    });
    await repo.save(s1);
    await repo.save(s2);

    const result = await useCase.execute({ status: "in_review" });
    expect(result).toHaveLength(1);
    expect(result[0]!.status).toBe("in_review");
  });
});
