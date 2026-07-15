import { describe, it, expect } from "@jest/globals";
import { BankStatementImport } from "../../domain/entities/bank-statement-import.js";
import {
  StatementAlreadyClosedError,
  StatementBalanceDifferenceError,
} from "../../domain/errors.js";

const periodStart = new Date("2026-06-30T00:00:00.000Z");
const periodEnd = new Date("2026-07-07T00:00:00.000Z");

function makeStatement(overrides: Partial<Parameters<typeof BankStatementImport.create>[0]> = {}) {
  return BankStatementImport.create({
    bankName: "Millennium BCP",
    accountNumber: "PT50000001234567890154300",
    periodStart,
    periodEnd,
    sourceType: "csv",
    openingBalance: 150_000, // 1 500,00 €
    closingBalance: 145_000, // 1 450,00 €
    ...overrides,
  });
}

describe("BankStatementImport", () => {
  it("creates with draft status and correct initial balance difference", () => {
    const s = makeStatement();
    expect(s.status).toBe("draft");
    expect(s.balanceDifference).toBe(5_000); // 150k - 145k
    expect(s.reconciliationProgress).toBe(0);
  });

  it("requires bank name", () => {
    expect(() => makeStatement({ bankName: "" })).toThrow("Bank name is required");
  });

  it("requires account number", () => {
    expect(() => makeStatement({ accountNumber: "" })).toThrow("Account number is required");
  });

  it("rejects inverted period", () => {
    expect(() =>
      makeStatement({ periodStart: periodEnd, periodEnd: periodStart })
    ).toThrow("Period start must be before");
  });

  it("updateStats transitions to in_review and recalculates balance diff", () => {
    const s = makeStatement();
    const updated = s.updateStats({
      importedMovementsCount: 5,
      calculatedClosingBalance: 145_000,
      reconciliationProgress: 40,
    });
    expect(updated.status).toBe("in_review");
    expect(updated.balanceDifference).toBe(0); // 145k - 145k
    expect(updated.reconciliationProgress).toBe(40);
    expect(updated.importedMovementsCount).toBe(5);
  });

  it("close fails when balance difference is not zero", () => {
    const s = makeStatement().updateStats({
      importedMovementsCount: 3,
      calculatedClosingBalance: 148_000, // ≠ closingBalance 145k
      reconciliationProgress: 100,
    });
    expect(() => s.close()).toThrow(StatementBalanceDifferenceError);
  });

  it("close succeeds when balance difference is zero", () => {
    const s = makeStatement()
      .updateStats({
        importedMovementsCount: 3,
        calculatedClosingBalance: 145_000,
        reconciliationProgress: 100,
      })
      .close();
    expect(s.status).toBe("closed");
  });

  it("close fails if already closed", () => {
    const s = makeStatement()
      .updateStats({
        importedMovementsCount: 1,
        calculatedClosingBalance: 145_000,
        reconciliationProgress: 100,
      })
      .close();
    expect(() => s.close()).toThrow(StatementAlreadyClosedError);
  });
});
