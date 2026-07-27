import { describe, it, expect } from "@jest/globals";
import { BankAccount } from "../../domain/entities/bank-account.js";

const BANK_ID = "bank-1";

describe("BankAccount entity", () => {
  describe("account type", () => {
    it("creates a checking account", () => {
      const acc = BankAccount.create({
        bankId: BANK_ID,
        type: "account",
        iban: "PT50000201231234567890154",
        accountType: "corrente",
      });
      expect(acc.type).toBe("account");
      expect(acc.accountType).toBe("corrente");
      expect(acc.lastFourDigits).toBeNull();
      expect(acc.isActive).toBe(true);
    });

    it("ignores credit card fields on account type", () => {
      const acc = BankAccount.create({
        bankId: BANK_ID,
        type: "account",
        lastFourDigits: "1234",
        billingCycleDay: 15,
      });
      expect(acc.lastFourDigits).toBeNull();
      expect(acc.billingCycleDay).toBeNull();
    });
  });

  describe("credit card type", () => {
    it("creates a credit card", () => {
      const acc = BankAccount.create({
        bankId: BANK_ID,
        type: "credit_card",
        lastFourDigits: "4242",
        cardName: "Visa Corporate",
        creditLimitCents: 500000,
        billingCycleDay: 25,
      });
      expect(acc.type).toBe("credit_card");
      expect(acc.lastFourDigits).toBe("4242");
      expect(acc.billingCycleDay).toBe(25);
      expect(acc.accountType).toBeNull();
    });

    it("throws if lastFourDigits is not 4 digits", () => {
      expect(() =>
        BankAccount.create({ bankId: BANK_ID, type: "credit_card", lastFourDigits: "12" })
      ).toThrow("4 digits");
    });
  });

  it("throws if billingCycleDay out of range", () => {
    expect(() =>
      BankAccount.create({ bankId: BANK_ID, type: "credit_card", billingCycleDay: 32 })
    ).toThrow("1 and 31");
  });

  it("matchesAccountNumber matches by IBAN (case/space insensitive)", () => {
    const acc = BankAccount.create({
      bankId: BANK_ID,
      type: "account",
      iban: "PT50 0002 0123 1234 5678 9015 4",
    });
    expect(acc.matchesAccountNumber("PT50000201231234567890154")).toBe(true);
    expect(acc.matchesAccountNumber("pt50 0002 0123 1234 5678 9015 4")).toBe(true);
    expect(acc.matchesAccountNumber("DIFFERENT")).toBe(false);
  });

  it("update returns new immutable instance", () => {
    const acc = BankAccount.create({ bankId: BANK_ID, type: "account", nickname: "Main" });
    const updated = acc.update({ nickname: "Secondary", isActive: false });
    expect(updated.nickname).toBe("Secondary");
    expect(updated.isActive).toBe(false);
    expect(acc.nickname).toBe("Main"); // original unchanged
  });
});
