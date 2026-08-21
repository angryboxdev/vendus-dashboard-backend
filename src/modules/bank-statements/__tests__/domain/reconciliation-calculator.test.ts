import { describe, it, expect } from "@jest/globals";
import { BankMovement } from "../../domain/entities/bank-movement.js";
import { ReconciliationCalculatorService } from "../../domain/services/reconciliation-calculator.service.js";

const calculator = new ReconciliationCalculatorService();

function makeMovement(opts: {
  type: "debit" | "credit";
  amount: number;
  hash: string;
  resolved?: boolean;
}) {
  const m = BankMovement.create({
    statementImportId: "s1",
    bookingDate: new Date("2026-07-01T00:00:00.000Z"),
    valueDate: new Date("2026-07-01T00:00:00.000Z"),
    description: "Test",
    amount: opts.amount,
    balanceAfter: 0,
    movementType: opts.type,
    deduplicationHash: opts.hash,
  });
  if (opts.resolved) {
    return m.classify({ justificationType: "despesa_bancaria_automatica" });
  }
  return m;
}

describe("ReconciliationCalculatorService", () => {
  it("returns openingBalance when movements list is empty", () => {
    const stats = calculator.compute(100_000, []);
    expect(stats.calculatedClosingBalance).toBe(100_000);
    expect(stats.reconciliationProgress).toBe(0);
    expect(stats.totalCount).toBe(0);
  });

  it("adds credits and subtracts debits from opening balance", () => {
    const movements = [
      makeMovement({ type: "credit", amount: 50_000, hash: "h1" }),
      makeMovement({ type: "debit", amount: 5_000, hash: "h2" }),
    ];
    const stats = calculator.compute(100_000, movements);
    expect(stats.calculatedClosingBalance).toBe(145_000); // 100k + 50k - 5k
  });

  it("calculates reconciliation progress correctly", () => {
    const movements = [
      makeMovement({ type: "debit", amount: 1_000, hash: "h1", resolved: true }),
      makeMovement({ type: "debit", amount: 2_000, hash: "h2", resolved: true }),
      makeMovement({ type: "debit", amount: 3_000, hash: "h3" }), // unresolved
      makeMovement({ type: "debit", amount: 4_000, hash: "h4" }), // unresolved
    ];
    const stats = calculator.compute(100_000, movements);
    expect(stats.resolvedCount).toBe(2);
    expect(stats.totalCount).toBe(4);
    expect(stats.reconciliationProgress).toBe(50);
  });

  it("counts statuses correctly", () => {
    const movements = [
      makeMovement({ type: "debit", amount: 100, hash: "h1", resolved: true }), // justificado (despesa_bancaria_automatica)
      makeMovement({ type: "debit", amount: 200, hash: "h2" }), // saida_nao_justificada
    ];
    const stats = calculator.compute(0, movements);
    expect(stats.statusCounts["justificado"]).toBe(1);
    expect(stats.statusCounts["saida_nao_justificada"]).toBe(1);
  });

  it("conciliado_parcial counts as unresolved for progress", () => {
    const partial = BankMovement.create({
      statementImportId: "s1",
      bookingDate: new Date("2026-07-01T00:00:00.000Z"),
      valueDate: new Date("2026-07-01T00:00:00.000Z"),
      description: "PAGAMENTO GALP",
      amount: 70_000,
      balanceAfter: 0,
      movementType: "debit",
      deduplicationHash: "h-partial",
    }).multiReconcile(2_000); // diff > 100 → conciliado_parcial

    const resolved = makeMovement({ type: "debit", amount: 1_000, hash: "h-resolved", resolved: true });

    const stats = calculator.compute(0, [partial, resolved]);
    expect(stats.statusCounts["conciliado_parcial"]).toBe(1);
    expect(stats.resolvedCount).toBe(1); // partial does NOT count as resolved
    expect(stats.reconciliationProgress).toBe(50);
  });
});
