import { describe, it, expect, beforeEach } from "@jest/globals";
import { DeleteBankStatementUseCase } from "../../application/use-cases/delete-bank-statement.use-case.js";
import { BankStatementImport } from "../../domain/entities/bank-statement-import.js";
import { FakeBankStatementImportRepository } from "../fakes/fake-bank-statement-import-repository.js";
import { StatementNotFoundError } from "../../domain/errors.js";

function makeStatement(accountNumber = "1234-5678") {
  return BankStatementImport.create({
    bankName: "Millennium BCP",
    accountNumber,
    periodStart: new Date("2026-07-01"),
    periodEnd: new Date("2026-07-31"),
    sourceType: "csv",
    openingBalance: 100_000,
    closingBalance: 95_000,
  });
}

describe("DeleteBankStatementUseCase", () => {
  let repo: FakeBankStatementImportRepository;
  let useCase: DeleteBankStatementUseCase;

  beforeEach(() => {
    repo = new FakeBankStatementImportRepository();
    useCase = new DeleteBankStatementUseCase(repo);
  });

  it("throws StatementNotFoundError for unknown id", async () => {
    await expect(useCase.execute("not-found")).rejects.toThrow(StatementNotFoundError);
  });

  it("removes the statement from the repository", async () => {
    const statement = makeStatement();
    await repo.save(statement);

    await useCase.execute(statement.id);

    const found = await repo.findById(statement.id);
    expect(found).toBeNull();
  });

  it("does not remove other statements", async () => {
    const s1 = makeStatement("111");
    const s2 = makeStatement("222");
    await repo.save(s1);
    await repo.save(s2);

    await useCase.execute(s1.id);

    const remaining = await repo.findAll();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.id).toBe(s2.id);
  });
});
