import { describe, it, expect, beforeEach } from "@jest/globals";
import { CreateReconciliationRuleUseCase } from "../../application/use-cases/create-reconciliation-rule.use-case.js";
import { DeleteReconciliationRuleUseCase } from "../../application/use-cases/delete-reconciliation-rule.use-case.js";
import { ListReconciliationRulesUseCase } from "../../application/use-cases/list-reconciliation-rules.use-case.js";
import { FakeBankReconciliationRuleRepository } from "../fakes/fake-bank-reconciliation-rule-repository.js";
import { RuleNotFoundError } from "../../domain/errors.js";

describe("Reconciliation Rules use-cases", () => {
  let repo: FakeBankReconciliationRuleRepository;
  let createUC: CreateReconciliationRuleUseCase;
  let deleteUC: DeleteReconciliationRuleUseCase;
  let listUC: ListReconciliationRulesUseCase;

  beforeEach(() => {
    repo = new FakeBankReconciliationRuleRepository();
    createUC = new CreateReconciliationRuleUseCase(repo);
    deleteUC = new DeleteReconciliationRuleUseCase(repo);
    listUC = new ListReconciliationRulesUseCase(repo);
  });

  it("creates a rule and lists it", async () => {
    const rule = await createUC.execute({
      name: "Comissão de conta",
      descriptionContains: "COM.MAN.CONTA",
      justificationType: "despesa_bancaria_automatica",
    });

    expect(rule.id).toBeDefined();
    expect(rule.isActive).toBe(true);

    const list = await listUC.execute();
    expect(list).toHaveLength(1);
    expect(list[0]!.name).toBe("Comissão de conta");
  });

  it("activeOnly filter works", async () => {
    await createUC.execute({
      name: "Rule A",
      descriptionContains: "A",
      justificationType: "despesa_bancaria_automatica",
    });
    const allRules = await listUC.execute(false);
    expect(allRules).toHaveLength(1);
    const activeOnly = await listUC.execute(true);
    expect(activeOnly).toHaveLength(1);
  });

  it("deletes a rule", async () => {
    const rule = await createUC.execute({
      name: "Test",
      descriptionContains: "TEST",
      justificationType: "despesa_bancaria_automatica",
    });

    await deleteUC.execute(rule.id);

    const list = await listUC.execute();
    expect(list).toHaveLength(0);
  });

  it("throws RuleNotFoundError when deleting unknown rule", async () => {
    await expect(deleteUC.execute("not-found")).rejects.toThrow(RuleNotFoundError);
  });
});
