import { describe, it, expect } from "@jest/globals";
import { BankMovement, computeInitialRisk } from "../../domain/entities/bank-movement.js";

function makeDebit(overrides: Partial<Parameters<typeof BankMovement.create>[0]> = {}) {
  return BankMovement.create({
    statementImportId: "stmt-1",
    bookingDate: new Date("2026-07-01T00:00:00.000Z"),
    valueDate: new Date("2026-07-01T00:00:00.000Z"),
    description: "COM.MAN.CONTA",
    amount: 500, // 5,00 €
    balanceAfter: 149_500,
    movementType: "debit",
    deduplicationHash: "hash-1",
    ...overrides,
  });
}

function makeCredit(overrides: Partial<Parameters<typeof BankMovement.create>[0]> = {}) {
  return BankMovement.create({
    statementImportId: "stmt-1",
    bookingDate: new Date("2026-07-02T00:00:00.000Z"),
    valueDate: new Date("2026-07-02T00:00:00.000Z"),
    description: "TRANSFERENCIA RECEBIDA MAKRO",
    amount: 50_000, // 500,00 €
    balanceAfter: 199_500,
    movementType: "credit",
    deduplicationHash: "hash-2",
    ...overrides,
  });
}

describe("BankMovement", () => {
  describe("create", () => {
    it("debit starts as saida_nao_justificada", () => {
      const m = makeDebit();
      expect(m.reconciliationStatus).toBe("saida_nao_justificada");
      expect(m.movementType).toBe("debit");
      expect(m.isResolved).toBe(false);
    });

    it("credit starts as conciliado_sem_fatura (auto-resolved)", () => {
      const m = makeCredit();
      expect(m.reconciliationStatus).toBe("conciliado_sem_fatura");
      expect(m.isResolved).toBe(true);
      expect(m.riskLevel).toBe("low");
      expect(m.requiresDocument).toBe(false);
    });

    it("rejects negative amount", () => {
      expect(() => makeDebit({ amount: -100 })).toThrow("non-negative");
    });

    it("rejects empty description", () => {
      expect(() => makeDebit({ description: "   " })).toThrow("description is required");
    });
  });

  describe("computeInitialRisk", () => {
    it("credit is always low", () => {
      expect(computeInitialRisk(1_000_000, "credit")).toBe("low");
    });
    it("debit < 50€ is low", () => {
      expect(computeInitialRisk(4_999, "debit")).toBe("low");
    });
    it("debit >= 50€ is medium", () => {
      expect(computeInitialRisk(5_000, "debit")).toBe("medium");
    });
    it("debit >= 500€ is high", () => {
      expect(computeInitialRisk(50_000, "debit")).toBe("high");
    });
    it("debit >= 5000€ is critical", () => {
      expect(computeInitialRisk(500_000, "debit")).toBe("critical");
    });
  });

  describe("classify", () => {
    it("fatura → conciliado_com_fatura, isResolved = true", () => {
      const m = makeDebit().classify({
        justificationType: "fatura",
        matchedEntityType: "invoice",
        matchedEntityId: "inv-1",
      });
      expect(m.reconciliationStatus).toBe("conciliado_com_fatura");
      expect(m.isResolved).toBe(true);
      expect(m.requiresDocument).toBe(true);
      expect(m.riskLevel).toBe("low");
    });

    it("despesa_bancaria_automatica → conciliado_sem_fatura", () => {
      const m = makeDebit().classify({
        justificationType: "despesa_bancaria_automatica",
      });
      expect(m.reconciliationStatus).toBe("conciliado_sem_fatura");
      expect(m.requiresDocument).toBe(false);
      expect(m.isResolved).toBe(true);
    });

    it("transferencia_interna → transferencia_interna", () => {
      const m = makeDebit().classify({ justificationType: "transferencia_interna" });
      expect(m.reconciliationStatus).toBe("transferencia_interna");
      expect(m.isResolved).toBe(true);
    });

    it("sem_justificativa → saida_nao_justificada", () => {
      const m = makeDebit().classify({ justificationType: "sem_justificativa" });
      expect(m.reconciliationStatus).toBe("saida_nao_justificada");
      expect(m.isResolved).toBe(false);
    });

    it("persiste costCenterGroupId e costCenterCategoryId", () => {
      const m = makeDebit().classify({
        justificationType: "despesa_bancaria_automatica",
        costCenterGroupId: "grp-1",
        costCenterCategoryId: "cat-1",
      });
      expect(m.costCenterGroupId).toBe("grp-1");
      expect(m.costCenterCategoryId).toBe("cat-1");
    });

    it("persiste supplierId", () => {
      const m = makeDebit().classify({
        justificationType: "recibo_comprovativo",
        supplierId: "sup-1",
        costCenterGroupId: "grp-1",
        costCenterCategoryId: "cat-1",
      });
      expect(m.supplierId).toBe("sup-1");
    });

    it("persiste vatRate e vatIncluded", () => {
      const m = makeDebit().classify({
        justificationType: "recibo_comprovativo",
        vatRate: 23,
        vatIncluded: true,
      });
      expect(m.vatRate).toBe(23);
      expect(m.vatIncluded).toBe(true);
    });

    it("novos campos são null quando não fornecidos", () => {
      const m = makeDebit().classify({ justificationType: "despesa_bancaria_automatica" });
      expect(m.costCenterGroupId).toBeNull();
      expect(m.costCenterCategoryId).toBeNull();
      expect(m.supplierId).toBeNull();
      expect(m.vatRate).toBeNull();
      expect(m.vatIncluded).toBeNull();
    });
  });

  describe("markAsSuggestion", () => {
    it("sets sugestao status with confidence capped at 1", () => {
      const m = makeDebit().markAsSuggestion("invoice", "inv-1", 1.5);
      expect(m.reconciliationStatus).toBe("sugestao");
      expect(m.confidenceScore).toBe(1);
      expect(m.matchedEntityType).toBe("invoice");
      expect(m.isResolved).toBe(false);
    });
  });

  describe("ignore", () => {
    it("marks as ignorado_com_motivo and sets notes", () => {
      const m = makeDebit().ignore("Movimento duplicado");
      expect(m.reconciliationStatus).toBe("ignorado_com_motivo");
      expect(m.notes).toBe("Movimento duplicado");
      expect(m.isResolved).toBe(true);
    });

    it("requires a non-empty reason", () => {
      expect(() => makeDebit().ignore("")).toThrow("reason is required");
    });
  });
});
