import { describe, it, expect, beforeEach } from "@jest/globals";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { ListReconciliationRulesUseCase } from "../../application/use-cases/list-reconciliation-rules.use-case.js";
import { BankReconciliationRule } from "../../domain/entities/bank-reconciliation-rule.js";
import { FakeBankReconciliationRuleRepository } from "../fakes/fake-bank-reconciliation-rule-repository.js";

function makeRule(descriptionContains: string, isActive = true) {
  const rule = BankReconciliationRule.create({
    name: descriptionContains,
    descriptionContains,
    justificationType: "despesa_bancaria_automatica",
    riskLevel: "low",
  });
  return isActive ? rule : rule.deactivate();
}

describe("ListReconciliationRulesUseCase", () => {
  const organizationId = mintOrganizationId("org-a");
  let repo: FakeBankReconciliationRuleRepository;
  let useCase: ListReconciliationRulesUseCase;

  beforeEach(() => {
    repo = new FakeBankReconciliationRuleRepository();
    useCase = new ListReconciliationRulesUseCase(repo);
  });

  it("returns empty array when no rules exist", async () => {
    const result = await useCase.execute({ organizationId });
    expect(result).toHaveLength(0);
  });

  it("returns all rules by default", async () => {
    await repo.save(organizationId, makeRule("COM.MAN.CONTA"));
    await repo.save(organizationId, makeRule("COMISSAO", false));

    const result = await useCase.execute({ organizationId });
    expect(result).toHaveLength(2);
  });

  it("returns only active rules when activeOnly=true", async () => {
    await repo.save(organizationId, makeRule("COM.MAN.CONTA", true));
    await repo.save(organizationId, makeRule("COMISSAO", false));

    const result = await useCase.execute({ organizationId, activeOnly: true });
    expect(result).toHaveLength(1);
    expect(result[0]!.descriptionContains).toBe("COM.MAN.CONTA");
  });

  it("rule DTO includes expected fields", async () => {
    await repo.save(organizationId, makeRule("COM.MAN.CONTA"));

    const [dto] = await useCase.execute({ organizationId });
    expect(dto).toMatchObject({
      descriptionContains: "COM.MAN.CONTA",
      justificationType: "despesa_bancaria_automatica",
      riskLevel: "low",
      isActive: true,
    });
    expect(dto!.id).toBeDefined();
  });
});
