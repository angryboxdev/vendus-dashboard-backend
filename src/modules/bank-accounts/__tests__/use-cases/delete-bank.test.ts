import { describe, it, expect, beforeEach } from "@jest/globals";
import { DeleteBankUseCase } from "../../application/use-cases/delete-bank.use-case.js";
import { FakeBankRepository } from "../fakes/fake-bank-repository.js";
import { FakeBankAccountRepository } from "../fakes/fake-bank-account-repository.js";
import { Bank } from "../../domain/entities/bank.js";
import { BankAccount } from "../../domain/entities/bank-account.js";

function makeBank() {
  return Bank.create({
    name: "Test Bank",
    logoKey: "other",
    color: "#000000",
    country: "PT",
    statementFormat: "generic_csv",
  });
}

describe("DeleteBankUseCase", () => {
  let repo: FakeBankRepository;
  let accountRepo: FakeBankAccountRepository;
  let useCase: DeleteBankUseCase;

  beforeEach(() => {
    repo = new FakeBankRepository();
    accountRepo = new FakeBankAccountRepository();
    useCase = new DeleteBankUseCase(repo, accountRepo);
  });

  it("deletes a bank with no accounts", async () => {
    const bank = makeBank();
    await repo.save(bank);
    await useCase.execute(bank.id);
    expect(await repo.findById(bank.id)).toBeNull();
  });

  it("throws BankNotFoundError for unknown id", async () => {
    await expect(useCase.execute("unknown")).rejects.toThrow("Bank not found");
  });

  it("throws BankHasAccountsError when bank has accounts", async () => {
    const bank = makeBank();
    await repo.save(bank);
    const account = BankAccount.create({ bankId: bank.id, type: "account" });
    await accountRepo.save(account);
    await expect(useCase.execute(bank.id)).rejects.toThrow("has associated accounts");
  });
});
