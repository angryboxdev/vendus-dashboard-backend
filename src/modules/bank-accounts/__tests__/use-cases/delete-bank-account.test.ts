import { describe, it, expect, beforeEach } from "@jest/globals";
import { DeleteBankAccountUseCase } from "../../application/use-cases/delete-bank-account.use-case.js";
import { FakeBankAccountRepository } from "../fakes/fake-bank-account-repository.js";
import { BankAccount } from "../../domain/entities/bank-account.js";

function makeAccount() {
  return BankAccount.create({ bankId: "bank-1", type: "account" });
}

describe("DeleteBankAccountUseCase", () => {
  let repo: FakeBankAccountRepository;
  let useCase: DeleteBankAccountUseCase;

  beforeEach(() => {
    repo = new FakeBankAccountRepository();
    useCase = new DeleteBankAccountUseCase(repo);
  });

  it("deletes an account with no statements", async () => {
    const acc = makeAccount();
    await repo.save(acc);
    await useCase.execute(acc.id);
    expect(await repo.findById(acc.id)).toBeNull();
  });

  it("throws BankAccountNotFoundError for unknown id", async () => {
    await expect(useCase.execute("unknown")).rejects.toThrow("Bank account not found");
  });

  it("throws BankAccountHasStatementsError when account has statements", async () => {
    const acc = makeAccount();
    await repo.save(acc);
    repo.setStatementCount(acc.id, 3);
    await expect(useCase.execute(acc.id)).rejects.toThrow("has imported statements");
  });
});
