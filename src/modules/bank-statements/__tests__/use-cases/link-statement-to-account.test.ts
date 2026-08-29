import { describe, it, expect, beforeEach } from "@jest/globals";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
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
  });
}

describe("LinkStatementToAccountUseCase", () => {
  const organizationId = mintOrganizationId("org-a");
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
    await statementRepo.save(organizationId, statement);
    bankAccountRead.seed(organizationId, "bank-acc-1");

    await useCase.execute({ organizationId, statementImportId: statement.id, bankAccountId: "bank-acc-1" });

    const updated = await statementRepo.findById(organizationId, statement.id);
    expect(updated?.bankAccountId).toBe("bank-acc-1");
  });

  it("throws StatementNotFoundError when statement does not exist", async () => {
    bankAccountRead.seed(organizationId, "bank-acc-1");

    await expect(
      useCase.execute({ organizationId, statementImportId: "nonexistent", bankAccountId: "bank-acc-1" })
    ).rejects.toBeInstanceOf(StatementNotFoundError);
  });

  it("throws when bank account does not exist", async () => {
    const statement = makeStatement();
    await statementRepo.save(organizationId, statement);

    await expect(
      useCase.execute({ organizationId, statementImportId: statement.id, bankAccountId: "nonexistent-acc" })
    ).rejects.toThrow("Bank account not found");
  });
});
