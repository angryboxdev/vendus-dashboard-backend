import { DeleteInvoiceUseCase } from "../../application/use-cases/delete-invoice.use-case.js";
import { FakeInvoiceRepository } from "../fakes/fake-invoice-repository.js";
import { FakeInvoiceLineRepository } from "../fakes/fake-invoice-line-repository.js";
import { Invoice } from "../../domain/entities/invoice.js";
import { InvoiceLine } from "../../domain/entities/invoice-line.js";
import { InvoiceNotFoundError } from "../../domain/errors.js";

describe("DeleteInvoiceUseCase", () => {
  let invoiceRepo: FakeInvoiceRepository;
  let lineRepo: FakeInvoiceLineRepository;
  let useCase: DeleteInvoiceUseCase;

  beforeEach(() => {
    invoiceRepo = new FakeInvoiceRepository();
    lineRepo = new FakeInvoiceLineRepository();
    useCase = new DeleteInvoiceUseCase(invoiceRepo, lineRepo);
  });

  it("elimina a fatura do repositório", async () => {
    const inv = Invoice.create({
      supplierName: "Makro",
      invoiceNumber: "MKR-001",
      invoiceDate: new Date("2026-06-01"),
      subtotalWithoutVat: 100000,
      totalVat: 23000,
      totalWithVat: 123000,
    });
    await invoiceRepo.save(inv);

    await useCase.execute(inv.id);

    const found = await invoiceRepo.findById(inv.id);
    expect(found).toBeNull();
  });

  it("elimina as linhas associadas à fatura", async () => {
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
      description: "Produto X",
      quantity: 5,
      unitCostWithoutVat: 20000,
      vatRate: 23,
      vatAmount: 23000,
      totalWithVat: 123000,
    });
    await invoiceRepo.save(inv);
    await lineRepo.saveAll([line]);

    await useCase.execute(inv.id);

    const lines = await lineRepo.findByInvoiceId(inv.id);
    expect(lines).toHaveLength(0);
  });

  it("lança InvoiceNotFoundError para id inexistente", async () => {
    await expect(useCase.execute("nao-existe")).rejects.toThrow(InvoiceNotFoundError);
  });
});
