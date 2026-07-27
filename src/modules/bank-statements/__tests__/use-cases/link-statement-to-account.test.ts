import { describe, it, expect, beforeEach } from "@jest/globals";
import { LinkStatementToAccountUseCase } from "../../application/use-cases/link-statement-to-account.use-case.js";
import { FakeBankStatementImportRepository } from "../fakes/fake-bank-statement-import-repository.js";
import { FakeBankAccountRead } from "../fakes/fake-bank-account-read.js";
import { BankStatementImport } from "../../domain/entities/bank-statement-import.js";
import { StatementNotFoundError } from "../../domain/errors.js";

function makeStatement(): BankStatementImport {
  return BankStatementImport.create({
    bankName: "Millennium BCP",
    accountNumber: "PT123",
    periodStart: new Date("2026-07-01"),
    periodEnd: new Date("2026-07-31"),
    sourceType: "csv",
    openingBalance: 100_000,
    closingBalance: 95_000,
    calculatedClosingBalance: 95_000,
    importedMovementsCount: 5,
    skippedDuplicates: 0,
  });
}

describe("LinkStatementToAccountUseCase", () => {
  let statementRepo: FakeBankStatementImportRepository;
  let bankAccountRead: FakeBankAccountRead;
  let useCase: LinkStatementToAccountUseCase;

  beforeEach(() => {
    statementRepo = new FakeBankStatementImportRepository();
    bankAccountRead = new FakeBankAccountRead();
    useCase = new LinkStatementToAccountUseCase(statementRepo, bankAccountRead);
  });

  it("links the statement to the bank account", async () => {
    const statement = makeStatement();
    await statementRepo.save(statement);
    bankAccountRead.seed("bank-acc-1");

    await useCase.execute(statement.id, "bank-acc-1");

    const updated = await statementRepo.findById(statement.id);
    expect(updated?.bankAccountId).toBe("bank-acc-1");
  });

  it("throws StatementNotFoundError when statement does not exist", async () => {
    bankAccountRead.seed("bank-acc-1");

    await expect(useCase.execute("nonexistent", "bank-acc-1")).rejects.toBeInstanceOf(
      StatementNotFoundError,
    );
  });

  it("throws when bank account does not exist", async () => {
    const statement = makeStatement();
    await statementRepo.save(statement);

    await expect(useCase.execute(statement.id, "nonexistent-acc")).rejects.toThrow(
      "Bank account not found",
    );
  });
});
