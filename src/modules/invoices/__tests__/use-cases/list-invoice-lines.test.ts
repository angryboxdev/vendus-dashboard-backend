import { ListInvoiceLinesUseCase } from "../../application/use-cases/list-invoice-lines.use-case.js";
import { FakeInvoiceLineRepository } from "../fakes/fake-invoice-line-repository.js";
import { InvoiceLine } from "../../domain/entities/invoice-line.js";

describe("ListInvoiceLinesUseCase", () => {
  let lineRepo: FakeInvoiceLineRepository;
  let useCase: ListInvoiceLinesUseCase;

  beforeEach(() => {
    lineRepo = new FakeInvoiceLineRepository();
    useCase = new ListInvoiceLinesUseCase(lineRepo);
  });

  it("returns empty array when no lines exist", async () => {
    const result = await useCase.execute();
    expect(result).toEqual([]);
  });

  it("returns all lines as DTOs", async () => {
    const lineA = InvoiceLine.create({
      invoiceId: "inv-1",
      description: "Farinha T55",
      quantity: 50,
      unitCostWithoutVat: 100,
      vatRate: 6,
      vatAmount: 300,
      totalWithVat: 5300,
    });
    const lineB = InvoiceLine.create({
      invoiceId: "inv-2",
      description: "Energia",
      type: "operational_expense",
      quantity: 1,
      unitCostWithoutVat: 8500,
      vatRate: 6,
      vatAmount: 510,
      totalWithVat: 9010,
    });
    await lineRepo.saveAll([lineA, lineB]);

    const result = await useCase.execute();
    expect(result).toHaveLength(2);
    expect(result.map((l) => l.description)).toEqual(
      expect.arrayContaining(["Farinha T55", "Energia"]),
    );
  });

  it("maps costCenterCategoryId to DTO", async () => {
    const line = InvoiceLine.create({
      invoiceId: "inv-1",
      description: "Ingredientes",
      costCenterCategoryId: "cat-cmv",
      quantity: 10,
      unitCostWithoutVat: 200,
      vatRate: 6,
      vatAmount: 120,
      totalWithVat: 2120,
    });
    await lineRepo.saveAll([line]);

    const result = await useCase.execute();
    expect(result[0]!.costCenterCategoryId).toBe("cat-cmv");
  });

  it("maps invoiceId correctly for each line", async () => {
    const lineA = InvoiceLine.create({
      invoiceId: "inv-A",
      description: "Item A",
      quantity: 1,
      unitCostWithoutVat: 500,
      vatRate: 23,
      vatAmount: 115,
      totalWithVat: 615,
    });
    const lineB = InvoiceLine.create({
      invoiceId: "inv-B",
      description: "Item B",
      quantity: 1,
      unitCostWithoutVat: 500,
      vatRate: 23,
      vatAmount: 115,
      totalWithVat: 615,
    });
    await lineRepo.saveAll([lineA, lineB]);

    const result = await useCase.execute();
    const invIds = result.map((l) => l.invoiceId);
    expect(invIds).toEqual(expect.arrayContaining(["inv-A", "inv-B"]));
  });

  it("DTO includes all monetary fields", async () => {
    const line = InvoiceLine.create({
      invoiceId: "inv-1",
      description: "Produto X",
      quantity: 2,
      unitCostWithoutVat: 1000,
      vatRate: 23,
      vatAmount: 460,
      totalWithVat: 2460,
    });
    await lineRepo.saveAll([line]);

    const dto = (await useCase.execute())[0]!;
    expect(dto.unitCostWithoutVat).toBe(1000);
    expect(dto.vatRate).toBe(23);
    expect(dto.vatAmount).toBe(460);
    expect(dto.totalWithVat).toBe(2460);
  });
});
