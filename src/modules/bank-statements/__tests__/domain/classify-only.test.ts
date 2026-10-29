import { describe, expect, it } from "@jest/globals";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { ClassifyMovementUseCase } from "../../application/use-cases/classify-movement.use-case.js";
import { BankMovement } from "../../domain/entities/bank-movement.js";
import { BankReconciliationRule } from "../../domain/entities/bank-reconciliation-rule.js";
import { InvalidClassificationError, InvalidRuleError } from "../../domain/errors.js";
import { computeMonthFigures } from "../../domain/services/account-month-stats.service.js";
import { FakeBankMovementRepository } from "../fakes/fake-bank-movement-repository.js";

// Dados fictícios.
const debit = (description = "MAKRO TESTE PORTO", amount = 12_300) =>
  BankMovement.create({
    bankAccountId: "acc-1",
    statementImportId: "stmt-1",
    bookingDate: new Date("2026-10-05T00:00:00.000Z"),
    valueDate: new Date("2026-10-05T00:00:00.000Z"),
    description,
    amount,
    balanceAfter: 100_000,
    movementType: "debit",
    deduplicationHash: `${description}|${amount}`,
  });

describe("Classificar sem conciliar", () => {
  it("só classificar: categoria para a DRE, fica «aguarda fatura» e não conta como conciliado", () => {
    const m = debit().classifyOnly({ costCenterGroupId: "g-cmv", costCenterCategoryId: "c-ingredientes", vatRate: 6, vatIncluded: true });
    expect(m).toMatchObject({
      reconciliationStatus: "pendente_de_documento",
      justificationType: null,
      matchedEntityType: null,
      costCenterCategoryId: "c-ingredientes",
      vatRate: 6,
      requiresDocument: true,
    });
    expect(m.hasClassification).toBe(true);
    expect(m.isResolved).toBe(false);
    expect(m.isUntouched).toBe(false);
  });

  it("desfazer a conciliação: manual volta a «classificado»; de uma regra limpa tudo (intocado)", () => {
    const manual = debit().classify({ justificationType: "recibo_comprovativo", costCenterCategoryId: "c-x" }).unreconcile();
    expect(manual).toMatchObject({ reconciliationStatus: "pendente_de_documento", costCenterCategoryId: "c-x" });

    const rule = BankReconciliationRule.create({
      name: "Makro",
      descriptionContains: "MAKRO TESTE PORTO",
      movementType: "debit",
      bankAccountId: "acc-1",
      justificationType: "recibo_comprovativo",
      costCenterCategoryId: "c-ingredientes",
    });
    const undone = debit().classifyByRule(rule).unreconcile();
    expect(undone.isUntouched).toBe(true);
    expect(undone.costCenterCategoryId).toBeNull();
  });

  it("remover a classificação: volta a «por justificar» sem categoria", () => {
    const m = debit().classifyOnly({ costCenterGroupId: null, costCenterCategoryId: "c-x" }).clearClassification();
    expect(m).toMatchObject({ reconciliationStatus: "saida_nao_justificada", costCenterCategoryId: null, costCenterGroupId: null });
    expect(m.isUntouched).toBe(true);
  });

  it("regra que só classifica: o movimento fica à espera da fatura; precisa de categoria e não pode pagar recorrências", () => {
    const rule = BankReconciliationRule.create({
      name: "Makro",
      descriptionContains: "MAKRO TESTE PORTO",
      movementType: "debit",
      bankAccountId: "acc-1",
      justificationType: "recibo_comprovativo",
      costCenterCategoryId: "c-ingredientes",
      classifyOnly: true,
    });
    const m = debit().classifyByRule(rule);
    expect(m).toMatchObject({ reconciliationStatus: "pendente_de_documento", justificationType: null, costCenterCategoryId: "c-ingredientes", classifiedByRuleId: rule.id });
    expect(() =>
      BankReconciliationRule.create({ name: "X", descriptionContains: "MAKRO TESTE PORTO", justificationType: "recibo_comprovativo", classifyOnly: true }),
    ).toThrow(InvalidRuleError);
  });

  it("estatísticas do mês: % classificado conta os conciliados e os só classificados", () => {
    const ms = [
      debit("A TESTE", 100).classify({ justificationType: "despesa_bancaria_automatica" }),
      debit("B TESTE", 200).classifyOnly({ costCenterGroupId: null, costCenterCategoryId: "c-x" }),
      debit("C TESTE", 300),
      debit("D TESTE", 400),
    ];
    expect(computeMonthFigures(ms, true)).toMatchObject({ reconciledMovements: 1, reconciledPercent: 25, classifiedMovements: 2, classifiedPercent: 50 });
  });
});

describe("ClassifyMovementUseCase — modos", () => {
  const organizationId = mintOrganizationId("org-a");

  it("classify grava a classificação; sem categoria recusa; clear limpa", async () => {
    const repo = new FakeBankMovementRepository();
    const uc = new ClassifyMovementUseCase(repo);
    const m = debit();
    await repo.saveBulk(organizationId, [m]);

    await expect(uc.execute({ organizationId, movementId: m.id, mode: "classify" })).rejects.toThrow(InvalidClassificationError);
    await uc.execute({ organizationId, movementId: m.id, mode: "classify", costCenterCategoryId: "c-ingredientes", vatRate: 6 });
    expect(await repo.findById(organizationId, m.id)).toMatchObject({ reconciliationStatus: "pendente_de_documento", costCenterCategoryId: "c-ingredientes", vatRate: 6 });

    await uc.execute({ organizationId, movementId: m.id, mode: "clear" });
    expect(await repo.findById(organizationId, m.id)).toMatchObject({ reconciliationStatus: "saida_nao_justificada", costCenterCategoryId: null });

    await expect(uc.execute({ organizationId, movementId: m.id })).rejects.toThrow(InvalidClassificationError);
  });
});
