import { describe, it, expect } from "@jest/globals";
import { BankMovement } from "../../domain/entities/bank-movement.js";
import { BankReconciliationRule } from "../../domain/entities/bank-reconciliation-rule.js";
import { AutoMatchingService } from "../../domain/services/auto-matching.service.js";
import { recurringMatchText } from "../../domain/utils/bank-description.js";
import { InvalidRuleError } from "../../domain/errors.js";

// Dados fictícios (descrições no formato do Millennium BCP, terminais e referências inventados).
const ACCOUNT = "acc-1";
const OTHER_ACCOUNT = "acc-2";

function movement(description: string, amount: number, type: "debit" | "credit" = "debit", bankAccountId: string = ACCOUNT) {
  return BankMovement.create({
    bankAccountId,
    statementImportId: "stmt-1",
    bookingDate: new Date("2026-09-01T00:00:00.000Z"),
    valueDate: new Date("2026-09-01T00:00:00.000Z"),
    description,
    amount,
    balanceAfter: 100_000,
    movementType: type,
    deduplicationHash: `${description}|${amount}|${type}`,
  });
}

function rule(over: Partial<Parameters<typeof BankReconciliationRule.create>[0]> = {}) {
  return BankReconciliationRule.create({
    name: "Taxa TPA",
    descriptionContains: "COMISSAO TPA 1234567 MOV N 12",
    movementType: "debit",
    bankAccountId: ACCOUNT,
    justificationType: "despesa_bancaria_automatica",
    costCenterGroupId: "cc-group",
    costCenterCategoryId: "cc-cat",
    ...over,
  });
}

const matcher = new AutoMatchingService();

describe("recurringMatchText", () => {
  it("drops words with digits so the text is the same every month", () => {
    expect(recurringMatchText("CREDITO TPA BCP 1234567 MOV N 92")).toBe("tpa bcp mov");
    expect(recurringMatchText("MDB9880 WWW.AMAZON* 70.24EUR")).toBe("www amazon");
    expect(recurringMatchText("PAGSERV Grupo Venda 11683/738002261 EASYPAY INS")).toBe("pagserv grupo venda easypay ins");
  });
});

describe("BankReconciliationRule", () => {
  it("defaults: any amount, 1€ tolerance", () => {
    const r = rule();
    expect(r.amountCents).toBeNull();
    expect(r.amountToleranceCents).toBe(100);
    expect(r.isAutomatic).toBe(true);
  });

  it("rejects «fatura» and «sem justificativa» (they never reconcile on their own)", () => {
    expect(() => rule({ justificationType: "fatura" })).toThrow(InvalidRuleError);
    expect(() => rule({ justificationType: "sem_justificativa" })).toThrow(InvalidRuleError);
  });

  it("rejects a text with no identifying words", () => {
    expect(() => rule({ descriptionContains: "12345 / 678" })).toThrow(InvalidRuleError);
  });

  it("edits fields (null clears the fixed amount) and pauses/reactivates", () => {
    const fixed = rule({ amountCents: 1_230 });
    const edited = fixed.edit({ amountCents: null, name: " Nova " });
    expect(edited.amountCents).toBeNull();
    expect(edited.name).toBe("Nova");
    expect(edited.deactivate().isAutomatic).toBe(false);
    expect(edited.deactivate().activate().isAutomatic).toBe(true);
  });

  it("legacy rules (reconstituted without the new columns) apply to every account", () => {
    const legacy = BankReconciliationRule.reconstitute({
      id: "legacy",
      name: "Comissão",
      descriptionContains: "COM.MAN.CONTA",
      movementType: "debit",
      costCenterGroupId: null,
      costCenterCategoryId: null,
      justificationType: "despesa_bancaria_automatica",
      requiresDocument: false,
      affectsDre: true,
      affectsCashflow: true,
      affectsProfitability: false,
      riskLevel: "low",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(legacy.bankAccountId).toBeNull();
    expect(matcher.matchRule([legacy], movement("COM.MAN.CONTA 2026", 500, "debit", OTHER_ACCOUNT))?.id).toBe("legacy");
  });
});

describe("AutoMatchingService (movimentos recorrentes)", () => {
  it("matches next month's movement with a different reference and amount (variable amount)", () => {
    const r = rule();
    expect(matcher.matchRule([r], movement("COMISSAO TPA 1234567 MOV N 47", 1_874))?.id).toBe(r.id);
  });

  it("only applies to the rule's account", () => {
    expect(matcher.matchRule([rule()], movement("COMISSAO TPA 1234567", 500, "debit", OTHER_ACCOUNT))).toBeNull();
  });

  it("respects the movement type", () => {
    expect(matcher.matchRule([rule()], movement("COMISSAO TPA 1234567", 500, "credit"))).toBeNull();
  });

  it("fixed amount: matches within the tolerance only", () => {
    const r = rule({ descriptionContains: "TRF P/ Senhorio Exemplo", amountCents: 120_000 });
    expect(matcher.matchRule([r], movement("TRF P/ Senhorio Exemplo", 120_080))?.id).toBe(r.id);
    expect(matcher.matchRule([r], movement("TRF P/ Senhorio Exemplo", 120_101))).toBeNull();
  });

  it("matches whole words only", () => {
    const r = rule({ descriptionContains: "TPA" });
    expect(matcher.matchRule([r], movement("TPAX SERVICOS", 500))).toBeNull();
    expect(matcher.matchRule([r], movement("COMISSAO TPA 99", 500))?.id).toBe(r.id);
  });

  it("prefers the most specific rule (fixed amount, then longer text)", () => {
    const generic = rule({ name: "Genérica", descriptionContains: "TARIFA" });
    const longer = rule({ name: "Mais longa", descriptionContains: "TARIFA MENSAL COMPLEMENTAR" });
    const fixed = rule({ name: "Valor fixo", descriptionContains: "TARIFA", amountCents: 1_230 });
    const m = movement("TARIFA MENSAL / COMPLEMENTAR 002995409", 1_230);
    expect(matcher.matchRule([generic, longer], m)?.name).toBe("Mais longa");
    expect(matcher.matchRule([generic, longer, fixed], m)?.name).toBe("Valor fixo");
  });

  it("ignores paused rules and legacy rules with «fatura»", () => {
    expect(matcher.matchRule([rule().deactivate()], movement("COMISSAO TPA 1", 500))).toBeNull();
  });

  it("applies only to untouched movements and records the rule", () => {
    const r = rule();
    const untouched = movement("COMISSAO TPA 1234567 MOV N 3", 900);
    const manual = movement("COMISSAO TPA 1234567 MOV N 4", 900).classify({ justificationType: "recibo_comprovativo" });
    const unjustified = movement("COMISSAO TPA 1234567 MOV N 5", 900).classify({ justificationType: "sem_justificativa" });

    const results = matcher.applyRules([r], [untouched, manual, unjustified]);

    expect(results).toHaveLength(1);
    const updated = results[0]!.updated;
    expect(updated.id).toBe(untouched.id);
    expect(updated.classifiedByRuleId).toBe(r.id);
    expect(updated.reconciliationStatus).toBe("justificado");
    expect(updated.costCenterGroupId).toBe("cc-group");
    expect(updated.costCenterCategoryId).toBe("cc-cat");
  });

  it("classifies auto-accepted credits too (e.g. TPA sales into a cost centre)", () => {
    const r = rule({ descriptionContains: "CREDITO TPA BCP", movementType: "credit", justificationType: "recibo_comprovativo" });
    const results = matcher.applyRules([r], [movement("CREDITO TPA BCP 1234567 MOV N 92", 36_908, "credit")]);
    expect(results).toHaveLength(1);
    expect(results[0]!.updated.classifiedByRuleId).toBe(r.id);
  });
});

describe("BankMovement rule link", () => {
  it("manual classification, unreconcile and ignore clear the link", () => {
    const byRule = movement("COMISSAO TPA 1", 500).classifyByRule(rule());
    expect(byRule.classifiedByRuleId).not.toBeNull();
    expect(byRule.isUntouched).toBe(false);
    expect(byRule.classify({ justificationType: "despesa_bancaria_automatica" }).classifiedByRuleId).toBeNull();
    const undone = byRule.unreconcile();
    expect(undone.classifiedByRuleId).toBeNull();
    expect(undone.isUntouched).toBe(true);
    expect(byRule.ignore("motivo").classifiedByRuleId).toBeNull();
  });

  it("detachRule keeps the classification", () => {
    const byRule = movement("COMISSAO TPA 1", 500).classifyByRule(rule());
    const detached = byRule.detachRule();
    expect(detached.classifiedByRuleId).toBeNull();
    expect(detached.reconciliationStatus).toBe("justificado");
    expect(detached.costCenterGroupId).toBe("cc-group");
  });
});
