import { describe, it, expect, beforeEach } from "@jest/globals";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { DeleteBankAccountUseCase } from "../../application/use-cases/delete-bank-account.use-case.js";
import { FakeBankAccountRepository } from "../fakes/fake-bank-account-repository.js";
import { BankAccount } from "../../domain/entities/bank-account.js";

function makeAccount() {
  return BankAccount.create({ bankId: "bank-1", type: "account" });
}

describe("DeleteBankAccountUseCase", () => {
  const organizationId = mintOrganizationId("org-a");
  let repo: FakeBankAccountRepository;
  let useCase: DeleteBankAccountUseCase;

  beforeEach(() => {
    repo = new FakeBankAccountRepository();
    useCase = new DeleteBankAccountUseCase(repo);
  });

  it("deletes an account with no statements", async () => {
    const acc = makeAccount();
    await repo.save(organizationId, acc);
    await useCase.execute({ organizationId, id: acc.id });
    expect(await repo.findById(organizationId, acc.id)).toBeNull();
  });

  it("throws BankAccountNotFoundError for unknown id", async () => {
    await expect(useCase.execute({ organizationId, id: "unknown" })).rejects.toThrow(
      "Bank account not found",
    );
  });

  it("throws BankAccountNotFoundError when the account belongs to another organization", async () => {
    const acc = makeAccount();
    await repo.save(organizationId, acc);
    const otherOrganizationId = mintOrganizationId("org-b");
    await expect(
      useCase.execute({ organizationId: otherOrganizationId, id: acc.id }),
    ).rejects.toThrow("Bank account not found");
  });

  it("throws BankAccountHasStatementsError when account has statements", async () => {
    const acc = makeAccount();
    await repo.save(organizationId, acc);
    repo.setStatementCount(organizationId, acc.id, 3);
    await expect(useCase.execute({ organizationId, id: acc.id })).rejects.toThrow(
      "has imported statements",
    );
  });
});
