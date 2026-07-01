import { ClassifyInvoiceLineUseCase } from "../../application/use-cases/classify-invoice-line.use-case.js";
import { FakeInvoiceRepository } from "../fakes/fake-invoice-repository.js";
import { FakeInvoiceLineRepository } from "../fakes/fake-invoice-line-repository.js";
import { FakeClassificationRuleRepository } from "../fakes/fake-classification-rule-repository.js";
import { Invoice } from "../../domain/entities/invoice.js";
import { InvoiceLine } from "../../domain/entities/invoice-line.js";
import { InvoiceNotFoundError, InvoiceLineNotFoundError } from "../../domain/errors.js";

describe("ClassifyInvoiceLineUseCase", () => {
  let invoiceRepo: FakeInvoiceRepository;
  let lineRepo: FakeInvoiceLineRepository;
  let ruleRepo: FakeClassificationRuleRepository;
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
    useCase = new ClassifyInvoiceLineUseCase(invoiceRepo, lineRepo, ruleRepo);
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

  it("guarda regra com costCenterCategoryId quando saveAsRule=true", async () => {
    await useCase.execute({
      invoiceId: inv.id,
      lineId: line.id,
      classify: { costCenterCategoryId: "cat-cmv" },
      saveAsRule: true,
    });
    const rule = await ruleRepo.findBySupplierId("supplier-1");
    expect(rule!.defaultCostCenterCategoryId).toBe("cat-cmv");
  });

  it("cria regra de classificação com tipo quando saveAsRule=true", async () => {
    await useCase.execute({
      invoiceId: inv.id,
      lineId: line.id,
      classify: { type: "stock_purchase" },
      saveAsRule: true,
    });
    const rule = await ruleRepo.findBySupplierId("supplier-1");
    expect(rule).not.toBeNull();
    expect(rule!.defaultLineType).toBe("stock_purchase");
    expect(rule!.confidenceBoost).toBe(10);
  });

  it("incrementa confidenceBoost quando regra já existe", async () => {
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
    const rule = await ruleRepo.findBySupplierId("supplier-1");
    expect(rule!.confidenceBoost).toBe(20);
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
