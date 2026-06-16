import { SuggestLineClassificationUseCase } from "../../application/use-cases/suggest-line-classification.use-case.js";
import { FakeClassificationRuleRepository } from "../fakes/fake-classification-rule-repository.js";
import { ClassificationRule } from "../../domain/entities/classification-rule.js";

describe("SuggestLineClassificationUseCase", () => {
  let ruleRepo: FakeClassificationRuleRepository;
  let useCase: SuggestLineClassificationUseCase;

  beforeEach(() => {
    ruleRepo = new FakeClassificationRuleRepository();
    useCase = new SuggestLineClassificationUseCase(ruleRepo);
  });

  it("retorna null quando não existe regra para o fornecedor", async () => {
    const result = await useCase.execute("supplier-desconhecido");
    expect(result).toBeNull();
  });

  it("retorna sugestão com score base 0.5 quando confidenceBoost é 0", async () => {
    const rule = ClassificationRule.create({
      supplierId: "supplier-1",
      defaultLineType: "stock_purchase",
      defaultCostCenterId: "cc-ope",
    });
    await ruleRepo.save(rule);

    const result = await useCase.execute("supplier-1");
    expect(result).not.toBeNull();
    expect(result!.lineType).toBe("stock_purchase");
    expect(result!.costCenterId).toBe("cc-ope");
    expect(result!.confidenceScore).toBe(0.5);
  });

  it("aumenta o score com confidenceBoost de 10", async () => {
    const rule = ClassificationRule.create({
      supplierId: "supplier-2",
      defaultLineType: "operational_expense",
    });
    const boosted = rule.update({ confidenceBoost: 10 });
    await ruleRepo.save(boosted);

    const result = await useCase.execute("supplier-2");
    // 0.5 + (10 / 100) * 0.5 = 0.55
    expect(result!.confidenceScore).toBeCloseTo(0.55);
  });

  it("score máximo de 1.0 com confidenceBoost de 100", async () => {
    const rule = ClassificationRule.create({
      supplierId: "supplier-3",
      defaultLineType: "stock_purchase",
      confidenceBoost: 100,
    });
    await ruleRepo.save(rule);

    const result = await useCase.execute("supplier-3");
    // 0.5 + (100 / 100) * 0.5 = 1.0
    expect(result!.confidenceScore).toBeCloseTo(1.0);
  });

  it("retorna category quando definida na regra", async () => {
    const rule = ClassificationRule.create({
      supplierId: "supplier-4",
      defaultLineType: "stock_purchase",
      defaultCategory: "Ingredientes",
    });
    await ruleRepo.save(rule);

    const result = await useCase.execute("supplier-4");
    expect(result!.category).toBe("Ingredientes");
  });
});
