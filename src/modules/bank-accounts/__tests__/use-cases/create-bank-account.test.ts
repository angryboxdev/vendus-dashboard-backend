import { describe, it, expect, beforeEach } from "@jest/globals";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { CreateBankAccountUseCase } from "../../application/use-cases/create-bank-account.use-case.js";
import { FakeBankRepository } from "../fakes/fake-bank-repository.js";
import { FakeBankAccountRepository } from "../fakes/fake-bank-account-repository.js";
import { Bank } from "../../domain/entities/bank.js";

function makeBank() {
  return Bank.create({
    name: "BCP",
    logoKey: "millennium_bcp",
    color: "#1A5276",
    country: "PT",
    statementFormat: "millennium_bcp_csv",
  });
}

describe("CreateBankAccountUseCase", () => {
  const organizationId = mintOrganizationId("org-a");
  let bankRepo: FakeBankRepository;
  let accountRepo: FakeBankAccountRepository;
  let useCase: CreateBankAccountUseCase;
  let bank: Bank;

  beforeEach(async () => {
    bankRepo = new FakeBankRepository();
    accountRepo = new FakeBankAccountRepository();
    useCase = new CreateBankAccountUseCase(bankRepo, accountRepo);
    bank = makeBank();
    await bankRepo.save(organizationId, bank);
  });

  it("creates a checking account under an existing bank", async () => {
    const result = await useCase.execute({
      organizationId,
      bankId: bank.id,
      type: "account",
      iban: "PT50000201231234567890154",
      accountType: "corrente",
    });
    expect(result.id).toBeDefined();
    expect(result.bankId).toBe(bank.id);
    expect(result.type).toBe("account");
    expect(result.isActive).toBe(true);
  });

  it("creates a credit card", async () => {
    const result = await useCase.execute({
      organizationId,
      bankId: bank.id,
      type: "credit_card",
      lastFourDigits: "4242",
      cardName: "Visa",
      billingCycleDay: 20,
    });
    expect(result.lastFourDigits).toBe("4242");
    expect(result.billingCycleDay).toBe(20);
  });

  it("throws BankNotFoundError for unknown bank", async () => {
    await expect(
      useCase.execute({ organizationId, bankId: "unknown", type: "account" })
    ).rejects.toThrow("Bank not found");
  });

  it("throws BankNotFoundError when the bank belongs to another organization", async () => {
    const otherOrganizationId = mintOrganizationId("org-b");
    await expect(
      useCase.execute({ organizationId: otherOrganizationId, bankId: bank.id, type: "account" })
    ).rejects.toThrow("Bank not found");
  });

  it("throws on invalid lastFourDigits", async () => {
    await expect(
      useCase.execute({ organizationId, bankId: bank.id, type: "credit_card", lastFourDigits: "12" })
    ).rejects.toThrow("4 digits");
  });
});
