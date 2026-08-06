import { ClassifyInvoiceLineUseCase } from "../../application/use-cases/classify-invoice-line.use-case.js";
import { FakeInvoiceRepository } from "../fakes/fake-invoice-repository.js";
import { FakeInvoiceLineRepository } from "../fakes/fake-invoice-line-repository.js";
import { FakeClassificationRuleRepository } from "../fakes/fake-classification-rule-repository.js";
import { FakeCostCenterCategoryReader } from "../fakes/fake-cost-center-category-reader.js";
import { Invoice } from "../../domain/entities/invoice.js";
import { InvoiceLine } from "../../domain/entities/invoice-line.js";
import { InvoiceNotFoundError, InvoiceLineNotFoundError, ChannelRequiredError } from "../../domain/errors.js";

describe("ClassifyInvoiceLineUseCase", () => {
  let invoiceRepo: FakeInvoiceRepository;
  let lineRepo: FakeInvoiceLineRepository;
  let ruleRepo: FakeClassificationRuleRepository;
  let categoryReader: FakeCostCenterCategoryReader;
  let useCase: ClassifyInvoiceLineUseCase;

  const inv = Invoice.create({
    supplierId: "supplier-1",
    supplierName: "Makro",
    invoiceNumber: "MKR-001",
    invoiceDate: new Date("2026-06-01"),
    subtotalWithoutVat: 100000,
    totalVat: 23000,
    totalWithVat: 123000,
  });

  const line = InvoiceLine.create({
    invoiceId: inv.id,
    description: "Farinha T55",
    quantity: 50,
    unitCostWithoutVat: 100,
    vatRate: 23,
    vatAmount: 1150,
    totalWithVat: 6150,
  });

  beforeEach(async () => {
    invoiceRepo = new FakeInvoiceRepository();
    lineRepo = new FakeInvoiceLineRepository();
    ruleRepo = new FakeClassificationRuleRepository();
    categoryReader = new FakeCostCenterCategoryReader();
    categoryReader.seed({
      id: "cat-cmv",
      financialType: "cmv",
      affectsDre: true,
      affectsCashflow: true,
      affectsProfitability: true,
      requiresChannel: false,
      requiresAllocation: false,
    });
    useCase = new ClassifyInvoiceLineUseCase(invoiceRepo, lineRepo, ruleRepo, categoryReader);
    await invoiceRepo.save(inv);
    await lineRepo.saveAll([line]);
  });

  it("classifica a linha com tipo", async () => {
    const dto = await useCase.execute({
      invoiceId: inv.id,
      lineId: line.id,
      classify: { type: "stock_purchase" },
    });
    expect(dto.type).toBe("stock_purchase");
  });

  it("classifica a linha com costCenterCategoryId", async () => {
    const dto = await useCase.execute({
      invoiceId: inv.id,
      lineId: line.id,
      classify: { costCenterCategoryId: "cat-cmv" },
    });
    expect(dto.costCenterCategoryId).toBe("cat-cmv");
  });

  it("classifica com tipo e costCenterCategoryId em conjunto", async () => {
    const dto = await useCase.execute({
      invoiceId: inv.id,
      lineId: line.id,
      classify: { type: "stock_purchase", costCenterCategoryId: "cat-cmv" },
    });
    expect(dto.type).toBe("stock_purchase");
    expect(dto.costCenterCategoryId).toBe("cat-cmv");
  });

  it("guarda regra com costCenterCategoryId e descriptionPattern quando saveAsRule=true", async () => {
    await useCase.execute({
      invoiceId: inv.id,
      lineId: line.id,
      classify: { costCenterCategoryId: "cat-cmv" },
      saveAsRule: true,
    });
    const rule = await ruleRepo.findBySupplierIdAndDescription("supplier-1", "Farinha T55");
    expect(rule!.defaultCostCenterCategoryId).toBe("cat-cmv");
    expect(rule!.descriptionPattern).toBe("Farinha T55");
  });

  it("cria regra com tipo e descriptionPattern quando saveAsRule=true", async () => {
    await useCase.execute({
      invoiceId: inv.id,
      lineId: line.id,
      classify: { type: "stock_purchase" },
      saveAsRule: true,
    });
    const rule = await ruleRepo.findBySupplierIdAndDescription("supplier-1", "Farinha T55");
    expect(rule).not.toBeNull();
    expect(rule!.defaultLineType).toBe("stock_purchase");
    expect(rule!.descriptionPattern).toBe("Farinha T55");
    expect(rule!.confidenceBoost).toBe(10);
  });

  it("incrementa confidenceBoost quando regra já existe para mesma descrição", async () => {
    await useCase.execute({
      invoiceId: inv.id,
      lineId: line.id,
      classify: { type: "stock_purchase" },
      saveAsRule: true,
    });
    await useCase.execute({
      invoiceId: inv.id,
      lineId: line.id,
      classify: { type: "stock_purchase" },
      saveAsRule: true,
    });
    const rule = await ruleRepo.findBySupplierIdAndDescription("supplier-1", "Farinha T55");
    expect(rule!.confidenceBoost).toBe(20);
  });

  it("herda financialType e flags da subcategoria ao classificar com costCenterCategoryId", async () => {
    const dto = await useCase.execute({
      invoiceId: inv.id,
      lineId: line.id,
      classify: { costCenterCategoryId: "cat-cmv" },
    });
    expect(dto.financialType).toBe("cmv");
    expect(dto.affectsDre).toBe(true);
    expect(dto.affectsCashflow).toBe(true);
    expect(dto.affectsProfitability).toBe(true);
    expect(dto.requiresChannel).toBe(false);
    expect(dto.requiresAllocation).toBe(false);
  });

  it("lança ChannelRequiredError quando subcategoria exige canal e channelId não fornecido", async () => {
    categoryReader.seed({
      id: "cat-mkt05",
      financialType: "marketing",
      affectsDre: true,
      affectsCashflow: true,
      affectsProfitability: true,
      requiresChannel: true,
      requiresAllocation: false,
    });
    await expect(
      useCase.execute({
        invoiceId: inv.id,
        lineId: line.id,
        classify: { costCenterCategoryId: "cat-mkt05" },
      }),
    ).rejects.toThrow(ChannelRequiredError);
  });

  it("classifica com canal quando subcategoria exige canal e channelId fornecido", async () => {
    categoryReader.seed({
      id: "cat-mkt05",
      financialType: "marketing",
      affectsDre: true,
      affectsCashflow: true,
      affectsProfitability: true,
      requiresChannel: true,
      requiresAllocation: false,
    });
    const dto = await useCase.execute({
      invoiceId: inv.id,
      lineId: line.id,
      classify: { costCenterCategoryId: "cat-mkt05", channelId: "ch-uber" },
    });
    expect(dto.channelId).toBe("ch-uber");
    expect(dto.financialType).toBe("marketing");
    expect(dto.requiresChannel).toBe(true);
  });

  it("DTO expõe dreValue e cashflowValue calculados", async () => {
    const dto = await useCase.execute({
      invoiceId: inv.id,
      lineId: line.id,
      classify: { costCenterCategoryId: "cat-cmv" },
    });
    // linha: vatAmount=1150, totalWithVat=6150
    expect(dto.dreValue).toBe(5000);
    expect(dto.cashflowValue).toBe(6150);
  });

  it("guarda channelId na regra quando saveAsRule=true", async () => {
    categoryReader.seed({
      id: "cat-mkt05",
      financialType: "marketing",
      affectsDre: true,
      affectsCashflow: true,
      affectsProfitability: true,
      requiresChannel: true,
      requiresAllocation: false,
    });
    await useCase.execute({
      invoiceId: inv.id,
      lineId: line.id,
      classify: { costCenterCategoryId: "cat-mkt05", channelId: "ch-uber" },
      saveAsRule: true,
    });
    const rule = await ruleRepo.findBySupplierIdAndDescription("supplier-1", "Farinha T55");
    expect(rule!.channelId).toBe("ch-uber");
  });

  it("throws InvoiceNotFoundError se fatura não existe", async () => {
    await expect(
      useCase.execute({ invoiceId: "no", lineId: line.id, classify: {} }),
    ).rejects.toThrow(InvoiceNotFoundError);
  });

  it("throws InvoiceLineNotFoundError se linha não existe", async () => {
    await expect(
      useCase.execute({ invoiceId: inv.id, lineId: "no", classify: {} }),
    ).rejects.toThrow(InvoiceLineNotFoundError);
  });
});
