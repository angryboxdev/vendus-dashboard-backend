import { SuggestLineClassificationUseCase } from "../../application/use-cases/suggest-line-classification.use-case.js";
import { FakeClassificationRuleRepository } from "../fakes/fake-classification-rule-repository.js";
import { ClassificationRule } from "../../domain/entities/classification-rule.js";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";

const ORG_ID = mintOrganizationId("org-test");

describe("SuggestLineClassificationUseCase", () => {
  let ruleRepo: FakeClassificationRuleRepository;
  let useCase: SuggestLineClassificationUseCase;

  beforeEach(() => {
    ruleRepo = new FakeClassificationRuleRepository();
    useCase = new SuggestLineClassificationUseCase(ruleRepo);
  });

  it("retorna null quando não existe regra para o fornecedor", async () => {
    const result = await useCase.execute(ORG_ID, "supplier-desconhecido");
    expect(result).toBeNull();
  });

  it("retorna null quando não existe regra que corresponda à descrição", async () => {
    const rule = ClassificationRule.create({
      supplierId: "supplier-1",
      descriptionPattern: "Taxa de Serviço",
      defaultCostCenterCategoryId: "cat-opd",
    });
    await ruleRepo.save(ORG_ID, rule);
    const result = await useCase.execute(ORG_ID, "supplier-1", "Ingredientes");
    expect(result).toBeNull();
  });

  it("retorna sugestão com score base 0.5 quando confidenceBoost é 0", async () => {
    const rule = ClassificationRule.create({
      supplierId: "supplier-1",
      defaultLineType: "stock_purchase",
      defaultCostCenterId: "cc-ope",
    });
    await ruleRepo.save(ORG_ID, rule);

    const result = await useCase.execute(ORG_ID, "supplier-1");
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
    await ruleRepo.save(ORG_ID, boosted);

    const result = await useCase.execute(ORG_ID, "supplier-2");
    // 0.5 + (10 / 100) * 0.5 = 0.55
    expect(result!.confidenceScore).toBeCloseTo(0.55);
  });

  it("score máximo de 1.0 com confidenceBoost de 100", async () => {
    const rule = ClassificationRule.create({
      supplierId: "supplier-3",
      defaultLineType: "stock_purchase",
      confidenceBoost: 100,
    });
    await ruleRepo.save(ORG_ID, rule);

    const result = await useCase.execute(ORG_ID, "supplier-3");
    // 0.5 + (100 / 100) * 0.5 = 1.0
    expect(result!.confidenceScore).toBeCloseTo(1.0);
  });

  it("retorna category quando definida na regra", async () => {
    const rule = ClassificationRule.create({
      supplierId: "supplier-4",
      defaultLineType: "stock_purchase",
      defaultCategory: "Ingredientes",
    });
    await ruleRepo.save(ORG_ID, rule);

    const result = await useCase.execute(ORG_ID, "supplier-4");
    expect(result!.category).toBe("Ingredientes");
  });

  it("retorna costCenterCategoryId quando definido na regra", async () => {
    const rule = ClassificationRule.create({
      supplierId: "supplier-5",
      defaultCostCenterCategoryId: "cat-cmv",
    });
    await ruleRepo.save(ORG_ID, rule);

    const result = await useCase.execute(ORG_ID, "supplier-5");
    expect(result!.costCenterCategoryId).toBe("cat-cmv");
  });

  it("retorna regra específica por descrição quando descriptionPattern faz match", async () => {
    const generic = ClassificationRule.create({
      supplierId: "supplier-uber",
      defaultCostCenterCategoryId: "cat-generic",
    });
    const specific = ClassificationRule.create({
      supplierId: "supplier-uber",
      descriptionPattern: "Taxa de Serviço",
      defaultCostCenterCategoryId: "cat-opd04",
      channelId: "ch-uber",
    });
    await ruleRepo.save(ORG_ID, generic);
    await ruleRepo.save(ORG_ID, specific);

    const result = await useCase.execute(ORG_ID, "supplier-uber", "Taxa de Serviço Uber Eats");
    expect(result!.costCenterCategoryId).toBe("cat-opd04");
    expect(result!.channelId).toBe("ch-uber");
  });

  it("retorna regra genérica como fallback quando nenhum padrão faz match", async () => {
    const generic = ClassificationRule.create({
      supplierId: "supplier-uber",
      defaultCostCenterCategoryId: "cat-generic",
    });
    const specific = ClassificationRule.create({
      supplierId: "supplier-uber",
      descriptionPattern: "Taxa de Serviço",
      defaultCostCenterCategoryId: "cat-opd04",
    });
    await ruleRepo.save(ORG_ID, generic);
    await ruleRepo.save(ORG_ID, specific);

    const result = await useCase.execute(ORG_ID, "supplier-uber", "Outro custo qualquer");
    expect(result!.costCenterCategoryId).toBe("cat-generic");
  });

  it("regra mais longa tem prioridade quando dois padrões fazem match", async () => {
    const short = ClassificationRule.create({
      supplierId: "supplier-uber",
      descriptionPattern: "Taxa",
      defaultCostCenterCategoryId: "cat-short",
    });
    const long = ClassificationRule.create({
      supplierId: "supplier-uber",
      descriptionPattern: "Taxa de Publicidade",
      defaultCostCenterCategoryId: "cat-mkt05",
    });
    await ruleRepo.save(ORG_ID, short);
    await ruleRepo.save(ORG_ID, long);

    const result = await useCase.execute(ORG_ID, "supplier-uber", "Taxa de Publicidade Glovo");
    expect(result!.costCenterCategoryId).toBe("cat-mkt05");
  });

  it("retorna channelId quando definido na regra", async () => {
    const rule = ClassificationRule.create({
      supplierId: "supplier-glovo",
      descriptionPattern: "publicidade",
      defaultCostCenterCategoryId: "cat-mkt05",
      channelId: "ch-glovo",
    });
    await ruleRepo.save(ORG_ID, rule);

    const result = await useCase.execute(ORG_ID, "supplier-glovo", "Custos de publicidade Glovo");
    expect(result!.channelId).toBe("ch-glovo");
  });
});
