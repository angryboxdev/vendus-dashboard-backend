import { describe, it, expect, beforeEach } from "@jest/globals";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { DeleteReconciliationRuleUseCase } from "../../application/use-cases/delete-reconciliation-rule.use-case.js";
import { BankReconciliationRule } from "../../domain/entities/bank-reconciliation-rule.js";
import { FakeBankReconciliationRuleRepository } from "../fakes/fake-bank-reconciliation-rule-repository.js";
import { RuleNotFoundError } from "../../domain/errors.js";

describe("DeleteReconciliationRuleUseCase", () => {
  const organizationId = mintOrganizationId("org-a");
  let repo: FakeBankReconciliationRuleRepository;
  let useCase: DeleteReconciliationRuleUseCase;

  beforeEach(() => {
    repo = new FakeBankReconciliationRuleRepository();
    useCase = new DeleteReconciliationRuleUseCase(repo);
  });

  it("throws RuleNotFoundError for unknown id", async () => {
    await expect(
      useCase.execute({ organizationId, id: "not-found" })
    ).rejects.toThrow(RuleNotFoundError);
  });

  it("removes the rule from the repository", async () => {
    const rule = BankReconciliationRule.create({
      name: "Taxa de manutenção",
      descriptionContains: "COM.MAN.CONTA",
      justificationType: "despesa_bancaria_automatica",
      riskLevel: "low",
    });
    await repo.save(organizationId, rule);

    await useCase.execute({ organizationId, id: rule.id });

    const remaining = await repo.findAll(organizationId);
    expect(remaining).toHaveLength(0);
  });

  it("does not remove other rules", async () => {
    const rule1 = BankReconciliationRule.create({
      name: "Taxa de manutenção",
      descriptionContains: "COM.MAN.CONTA",
      justificationType: "despesa_bancaria_automatica",
      riskLevel: "low",
    });
    const rule2 = BankReconciliationRule.create({
      name: "Comissão",
      descriptionContains: "COMISSAO",
      justificationType: "despesa_bancaria_automatica",
      riskLevel: "low",
    });
    await repo.save(organizationId, rule1);
    await repo.save(organizationId, rule2);

    await useCase.execute({ organizationId, id: rule1.id });

    const remaining = await repo.findAll(organizationId);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.id).toBe(rule2.id);
  });
});
