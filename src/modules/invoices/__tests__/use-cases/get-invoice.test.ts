import { GetInvoiceUseCase } from "../../application/use-cases/get-invoice.use-case.js";
import { FakeInvoiceRepository } from "../fakes/fake-invoice-repository.js";
import { FakeInvoiceLineRepository } from "../fakes/fake-invoice-line-repository.js";
import { Invoice } from "../../domain/entities/invoice.js";
import { InvoiceLine } from "../../domain/entities/invoice-line.js";
import { InvoiceNotFoundError } from "../../domain/errors.js";

describe("GetInvoiceUseCase", () => {
  let invoiceRepo: FakeInvoiceRepository;
  let lineRepo: FakeInvoiceLineRepository;
  let useCase: GetInvoiceUseCase;

  beforeEach(() => {
    invoiceRepo = new FakeInvoiceRepository();
    lineRepo = new FakeInvoiceLineRepository();
    useCase = new GetInvoiceUseCase(invoiceRepo, lineRepo);
  });

  it("retorna a fatura com as suas linhas", async () => {
    const inv = Invoice.create({
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
      quantity: 10,
      unitCostWithoutVat: 10000,
      vatRate: 23,
      vatAmount: 23000,
      totalWithVat: 123000,
    });
    await invoiceRepo.save(inv);
    await lineRepo.saveAll([line]);

    const dto = await useCase.execute(inv.id);
    expect(dto.id).toBe(inv.id);
    expect(dto.lines).toHaveLength(1);
    expect(dto.lines![0]!.description).toBe("Farinha T55");
  });

  it("retorna fatura sem linhas quando não existem", async () => {
    const inv = Invoice.create({
      supplierName: "EDP",
      invoiceNumber: "EDP-001",
      invoiceDate: new Date("2026-06-01"),
      subtotalWithoutVat: 85000,
      totalVat: 5100,
      totalWithVat: 90100,
    });
    await invoiceRepo.save(inv);

    const dto = await useCase.execute(inv.id);
    expect(dto.lines).toHaveLength(0);
  });

  it("lança InvoiceNotFoundError para id inexistente", async () => {
    await expect(useCase.execute("nao-existe")).rejects.toThrow(InvoiceNotFoundError);
  });
});
