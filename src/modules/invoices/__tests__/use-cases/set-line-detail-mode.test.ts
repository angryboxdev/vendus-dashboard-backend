import { SetLineDetailModeUseCase } from "../../application/use-cases/set-line-detail-mode.use-case.js";
import { FakeInvoiceRepository } from "../fakes/fake-invoice-repository.js";
import { FakeInvoiceLineRepository } from "../fakes/fake-invoice-line-repository.js";
import { Invoice } from "../../domain/entities/invoice.js";
import { InvoiceLine } from "../../domain/entities/invoice-line.js";
import { InvoiceNotFoundError } from "../../domain/errors.js";

const makeInvoice = () =>
  Invoice.create({
    supplierName: "Makro",
    invoiceNumber: "MKR-001",
    invoiceDate: new Date("2026-06-01"),
    subtotalWithoutVat: 100000,
    totalVat: 23000,
    totalWithVat: 123000,
  });

const makeLine = (invoiceId: string, totalWithVat: number, vatAmount: number) =>
  InvoiceLine.create({
    invoiceId,
    description: "Linha teste",
    quantity: 1,
    unitCostWithoutVat: totalWithVat - vatAmount,
    vatRate: 23,
    vatAmount,
    totalWithVat,
  });

describe("SetLineDetailModeUseCase", () => {
  let invoiceRepo: FakeInvoiceRepository;
  let lineRepo: FakeInvoiceLineRepository;
  let useCase: SetLineDetailModeUseCase;

  beforeEach(() => {
    invoiceRepo = new FakeInvoiceRepository();
    lineRepo = new FakeInvoiceLineRepository();
    useCase = new SetLineDetailModeUseCase(invoiceRepo, lineRepo);
  });

  it("switches invoice from simple to detailed mode", async () => {
    const inv = makeInvoice();
    await invoiceRepo.save(inv);

    const dto = await useCase.execute({ id: inv.id, mode: "detailed" });
    expect(dto.lineDetailMode).toBe("detailed");
  });

  it("switches detailed back to simple even when there are no lines", async () => {
    const inv = makeInvoice().setLineDetailMode("detailed");
    await invoiceRepo.save(inv);

    const dto = await useCase.execute({ id: inv.id, mode: "simple" });
    expect(dto.lineDetailMode).toBe("simple");
  });

  it("deletes detailed lines when switching back to simple (lines do not match)", async () => {
    const inv = makeInvoice().setLineDetailMode("detailed");
    await invoiceRepo.save(inv);
    await lineRepo.saveAll([makeLine(inv.id, 50000, 10000)]); // soma diferente do total da fatura

    const dto = await useCase.execute({ id: inv.id, mode: "simple" });
    expect(dto.lineDetailMode).toBe("simple");

    const remaining = await lineRepo.findByInvoiceId(inv.id);
    expect(remaining).toHaveLength(0);
  });

  it("deletes detailed lines when switching back to simple (lines match)", async () => {
    const inv = makeInvoice().setLineDetailMode("detailed");
    await invoiceRepo.save(inv);
    await lineRepo.saveAll([makeLine(inv.id, 123000, 23000)]);

    await useCase.execute({ id: inv.id, mode: "simple" });

    const remaining = await lineRepo.findByInvoiceId(inv.id);
    expect(remaining).toHaveLength(0);
  });

  it("does not delete lines when switching from simple to detailed", async () => {
    // linhas de outra fatura não devem ser tocadas
    const inv = makeInvoice();
    const other = makeInvoice().setLineDetailMode("detailed");
    await invoiceRepo.save(inv);
    await invoiceRepo.save(other);
    await lineRepo.saveAll([makeLine(other.id, 123000, 23000)]);

    await useCase.execute({ id: inv.id, mode: "detailed" });

    const otherLines = await lineRepo.findByInvoiceId(other.id);
    expect(otherLines).toHaveLength(1);
  });

  it("throws InvoiceNotFoundError when invoice does not exist", async () => {
    await expect(useCase.execute({ id: "nonexistent", mode: "detailed" })).rejects.toThrow(InvoiceNotFoundError);
  });
});
