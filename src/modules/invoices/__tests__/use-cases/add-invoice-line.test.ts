import { AddInvoiceLineUseCase } from "../../application/use-cases/add-invoice-line.use-case.js";
import { FakeInvoiceRepository } from "../fakes/fake-invoice-repository.js";
import { FakeInvoiceLineRepository } from "../fakes/fake-invoice-line-repository.js";
import { Invoice } from "../../domain/entities/invoice.js";
import { InvoiceNotFoundError } from "../../domain/errors.js";

describe("AddInvoiceLineUseCase", () => {
  let invoiceRepo: FakeInvoiceRepository;
  let lineRepo: FakeInvoiceLineRepository;
  let useCase: AddInvoiceLineUseCase;

  const invoice = Invoice.create({
    supplierName: "Makro Portugal",
    invoiceNumber: "MKR-001",
    invoiceDate: new Date("2026-06-01"),
    subtotalWithoutVat: 0,
    totalVat: 0,
    totalWithVat: 0,
  });

  beforeEach(async () => {
    invoiceRepo = new FakeInvoiceRepository();
    lineRepo = new FakeInvoiceLineRepository();
    useCase = new AddInvoiceLineUseCase(invoiceRepo, lineRepo);
    await invoiceRepo.save(invoice);
  });

  it("adds a line and returns its DTO", async () => {
    const dto = await useCase.execute({
      invoiceId: invoice.id,
      description: "Farinha T55",
      quantity: 50,
      unitCostWithoutVat: 100,
      vatRate: 6,
      vatAmount: 300,
      totalWithVat: 5300,
    });

    expect(dto.id).toBeDefined();
    expect(dto.invoiceId).toBe(invoice.id);
    expect(dto.description).toBe("Farinha T55");
    expect(dto.quantity).toBe(50);
    expect(dto.unitCostWithoutVat).toBe(100);
    expect(dto.vatRate).toBe(6);
    expect(dto.totalWithVat).toBe(5300);
  });

  it("defaults type to 'other' when not provided", async () => {
    const dto = await useCase.execute({
      invoiceId: invoice.id,
      description: "Produto",
      quantity: 1,
      unitCostWithoutVat: 1000,
      vatRate: 23,
      vatAmount: 230,
      totalWithVat: 1230,
    });

    expect(dto.type).toBe("other");
  });

  it("persists the explicit type when provided", async () => {
    const dto = await useCase.execute({
      invoiceId: invoice.id,
      description: "Energia",
      type: "operational_expense",
      quantity: 1,
      unitCostWithoutVat: 8500,
      vatRate: 6,
      vatAmount: 510,
      totalWithVat: 9010,
    });

    expect(dto.type).toBe("operational_expense");
  });

  it("persists costCenterCategoryId when provided", async () => {
    const dto = await useCase.execute({
      invoiceId: invoice.id,
      description: "Farinha",
      costCenterCategoryId: "cat-cmv",
      quantity: 10,
      unitCostWithoutVat: 200,
      vatRate: 6,
      vatAmount: 120,
      totalWithVat: 2120,
    });

    expect(dto.costCenterCategoryId).toBe("cat-cmv");
  });

  it("persists null costCenterCategoryId when not provided", async () => {
    const dto = await useCase.execute({
      invoiceId: invoice.id,
      description: "Produto",
      quantity: 1,
      unitCostWithoutVat: 500,
      vatRate: 23,
      vatAmount: 115,
      totalWithVat: 615,
    });

    expect(dto.costCenterCategoryId).toBeNull();
  });

  it("persists category (free text) when provided", async () => {
    const dto = await useCase.execute({
      invoiceId: invoice.id,
      description: "Especiarias",
      category: "Ingredientes secos",
      quantity: 5,
      unitCostWithoutVat: 300,
      vatRate: 6,
      vatAmount: 90,
      totalWithVat: 1590,
    });

    expect(dto.category).toBe("Ingredientes secos");
  });

  it("persists unit when provided", async () => {
    const dto = await useCase.execute({
      invoiceId: invoice.id,
      description: "Óleo",
      unit: "L",
      quantity: 20,
      unitCostWithoutVat: 150,
      vatRate: 6,
      vatAmount: 180,
      totalWithVat: 3180,
    });

    expect(dto.unit).toBe("L");
  });

  it("stores the line in the repository", async () => {
    await useCase.execute({
      invoiceId: invoice.id,
      description: "Sal",
      quantity: 100,
      unitCostWithoutVat: 50,
      vatRate: 6,
      vatAmount: 300,
      totalWithVat: 5300,
    });

    const stored = await lineRepo.findByInvoiceId(invoice.id);
    expect(stored).toHaveLength(1);
    expect(stored[0]!.description).toBe("Sal");
  });

  it("can add multiple lines independently", async () => {
    await useCase.execute({
      invoiceId: invoice.id,
      description: "Linha A",
      quantity: 1,
      unitCostWithoutVat: 1000,
      vatRate: 23,
      vatAmount: 230,
      totalWithVat: 1230,
    });
    await useCase.execute({
      invoiceId: invoice.id,
      description: "Linha B",
      quantity: 2,
      unitCostWithoutVat: 500,
      vatRate: 23,
      vatAmount: 230,
      totalWithVat: 1230,
    });

    const stored = await lineRepo.findByInvoiceId(invoice.id);
    expect(stored).toHaveLength(2);
  });

  it("throws InvoiceNotFoundError when invoice does not exist", async () => {
    await expect(
      useCase.execute({
        invoiceId: "invoice-inexistente",
        description: "Produto",
        quantity: 1,
        unitCostWithoutVat: 1000,
        vatRate: 23,
        vatAmount: 230,
        totalWithVat: 1230,
      }),
    ).rejects.toThrow(InvoiceNotFoundError);
  });
});
