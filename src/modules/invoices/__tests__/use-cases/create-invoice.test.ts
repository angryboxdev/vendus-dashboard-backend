import { CreateInvoiceUseCase } from "../../application/use-cases/create-invoice.use-case.js";
import { FakeInvoiceRepository } from "../fakes/fake-invoice-repository.js";
import { FakeInvoiceLineRepository } from "../fakes/fake-invoice-line-repository.js";
import { FakePayableEntryWrite } from "../fakes/fake-payable-entry-write.js";

describe("CreateInvoiceUseCase", () => {
  let invoiceRepo: FakeInvoiceRepository;
  let lineRepo: FakeInvoiceLineRepository;
  let payableWrite: FakePayableEntryWrite;
  let useCase: CreateInvoiceUseCase;

  beforeEach(() => {
    invoiceRepo = new FakeInvoiceRepository();
    lineRepo = new FakeInvoiceLineRepository();
    payableWrite = new FakePayableEntryWrite();
    useCase = new CreateInvoiceUseCase(invoiceRepo, lineRepo, payableWrite);
  });

  it("creates and persists invoice with pending status", async () => {
    const dto = await useCase.execute({
      supplierName: "Makro Portugal",
      invoiceNumber: "MKR-001",
      invoiceDate: "2026-06-01",
      subtotalWithoutVat: 100000,
      totalVat: 23000,
      totalWithVat: 123000,
    });

    expect(dto.id).toBeDefined();
    expect(dto.status).toBe("pending");
    expect(dto.supplierName).toBe("Makro Portugal");
    expect(dto.totalWithVat).toBe(123000);
    expect(dto.lines).toHaveLength(0);
  });

  it("creates invoice with lines", async () => {
    const dto = await useCase.execute({
      supplierName: "EDP",
      invoiceNumber: "EDP-2026-001",
      invoiceDate: "2026-06-01",
      subtotalWithoutVat: 85000,
      totalVat: 5100,
      totalWithVat: 90100,
      lines: [
        {
          description: "Energia eléctrica",
          type: "operational_expense",
          quantity: 1,
          unitCostWithoutVat: 85000,
          vatRate: 6,
          vatAmount: 5100,
          totalWithVat: 90100,
        },
      ],
    });

    expect(dto.lines).toHaveLength(1);
    expect(dto.lines![0]!.description).toBe("Energia eléctrica");
    expect(dto.lines![0]!.type).toBe("operational_expense");
    expect(dto.lines![0]!.invoiceId).toBe(dto.id);
  });

  it("creates invoice with lines including costCenterCategoryId", async () => {
    const dto = await useCase.execute({
      supplierName: "Makro",
      invoiceNumber: "MKR-002",
      invoiceDate: "2026-06-01",
      subtotalWithoutVat: 50000,
      totalVat: 3000,
      totalWithVat: 53000,
      lines: [
        {
          description: "Farinha T55",
          type: "stock_purchase",
          costCenterCategoryId: "cat-cmv",
          category: "Ingredientes",
          quantity: 50,
          unitCostWithoutVat: 1000,
          vatRate: 6,
          vatAmount: 3000,
          totalWithVat: 53000,
        },
      ],
    });

    expect(dto.lines).toHaveLength(1);
    expect(dto.lines![0]!.costCenterCategoryId).toBe("cat-cmv");
    expect(dto.lines![0]!.category).toBe("Ingredientes");
    expect(dto.lines![0]!.type).toBe("stock_purchase");
  });

  it("persists supplierId when provided", async () => {
    const dto = await useCase.execute({
      supplierId: "supplier-abc",
      supplierName: "EDP",
      invoiceNumber: "EDP-001",
      invoiceDate: "2026-06-01",
      subtotalWithoutVat: 50000,
      totalVat: 3000,
      totalWithVat: 53000,
    });

    expect(dto.supplierId).toBe("supplier-abc");
  });

  it("invoiceDate is serialised as YYYY-MM-DD", async () => {
    const dto = await useCase.execute({
      supplierName: "Test",
      invoiceNumber: "T-001",
      invoiceDate: "2026-05-15",
      subtotalWithoutVat: 10000,
      totalVat: 2300,
      totalWithVat: 12300,
    });
    expect(dto.invoiceDate).toBe("2026-05-15");
  });

  it("auto-creates payable entry when invoice has dueDate", async () => {
    const dto = await useCase.execute({
      supplierName: "EDP",
      invoiceNumber: "EDP-001",
      invoiceDate: "2026-07-01",
      dueDate: "2026-07-31",
      subtotalWithoutVat: 85000,
      totalVat: 5100,
      totalWithVat: 90100,
    });
    expect(payableWrite.created).toHaveLength(1);
    expect(payableWrite.created[0]!.invoiceId).toBe(dto.id);
    expect(payableWrite.created[0]!.amount).toBe(90100);
    expect(payableWrite.created[0]!.dueDate).toEqual(new Date("2026-07-31"));
  });

  it("does NOT create payable entry when invoice has no dueDate", async () => {
    await useCase.execute({
      supplierName: "EDP",
      invoiceNumber: "EDP-002",
      invoiceDate: "2026-07-01",
      subtotalWithoutVat: 85000,
      totalVat: 5100,
      totalWithVat: 90100,
    });
    expect(payableWrite.created).toHaveLength(0);
  });
});
