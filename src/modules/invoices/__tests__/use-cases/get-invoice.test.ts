import { GetInvoiceUseCase } from "../../application/use-cases/get-invoice.use-case.js";
import { FakeInvoiceRepository } from "../fakes/fake-invoice-repository.js";
import { FakeInvoiceLineRepository } from "../fakes/fake-invoice-line-repository.js";
import { Invoice } from "../../domain/entities/invoice.js";
import { InvoiceLine } from "../../domain/entities/invoice-line.js";
import { InvoiceNotFoundError } from "../../domain/errors.js";

const makeDetailedInvoice = (props: { subtotalWithoutVat: number; totalVat: number; totalWithVat: number }) =>
  Invoice.create({
    supplierName: "Makro",
    invoiceNumber: "MKR-001",
    invoiceDate: new Date("2026-06-01"),
    lineDetailMode: "detailed",
    ...props,
  });

const makeLine = (invoiceId: string, totalWithVat: number, vatAmount: number) =>
  InvoiceLine.create({
    invoiceId,
    description: "Produto",
    quantity: 1,
    unitCostWithoutVat: totalWithVat - vatAmount,
    vatRate: 23,
    vatAmount,
    totalWithVat,
  });

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

  // ── linesSummary ────────────────────────────────────────────────────────────

  it("não inclui linesSummary em modo simple", async () => {
    const inv = Invoice.create({
      supplierName: "EDP",
      invoiceNumber: "EDP-001",
      invoiceDate: new Date("2026-06-01"),
      subtotalWithoutVat: 10000,
      totalVat: 2300,
      totalWithVat: 12300,
      // lineDetailMode default = "simple"
    });
    await invoiceRepo.save(inv);

    const dto = await useCase.execute(inv.id);
    expect(dto.linesSummary).toBeUndefined();
  });

  it("inclui linesSummary em modo detailed com totais corretos e totalsMismatch=false", async () => {
    const inv = makeDetailedInvoice({ subtotalWithoutVat: 10000, totalVat: 2300, totalWithVat: 12300 });
    await invoiceRepo.save(inv);
    await lineRepo.saveAll([makeLine(inv.id, 12300, 2300)]);

    const dto = await useCase.execute(inv.id);
    expect(dto.linesSummary).toBeDefined();
    expect(dto.linesSummary!.totalWithVat).toBe(12300);
    expect(dto.linesSummary!.totalVat).toBe(2300);
    expect(dto.linesSummary!.subtotalWithoutVat).toBe(10000);
    expect(dto.linesSummary!.totalsMismatch).toBe(false);
  });

  it("linesSummary.totalsMismatch=true quando linhas não somam o total da fatura", async () => {
    const inv = makeDetailedInvoice({ subtotalWithoutVat: 10000, totalVat: 2300, totalWithVat: 12300 });
    await invoiceRepo.save(inv);
    await lineRepo.saveAll([makeLine(inv.id, 5000, 1000)]); // soma parcial

    const dto = await useCase.execute(inv.id);
    expect(dto.linesSummary!.totalsMismatch).toBe(true);
  });

  it("linesSummary.totalsMismatch=false dentro da tolerância de 1 cêntimo", async () => {
    const inv = makeDetailedInvoice({ subtotalWithoutVat: 10000, totalVat: 2300, totalWithVat: 12300 });
    await invoiceRepo.save(inv);
    await lineRepo.saveAll([makeLine(inv.id, 12301, 2301)]); // 1 cêntimo acima

    const dto = await useCase.execute(inv.id);
    expect(dto.linesSummary!.totalsMismatch).toBe(false);
  });

  it("linesSummary com zero linhas em modo detailed mostra totalsMismatch=true", async () => {
    const inv = makeDetailedInvoice({ subtotalWithoutVat: 10000, totalVat: 2300, totalWithVat: 12300 });
    await invoiceRepo.save(inv);
    // sem linhas

    const dto = await useCase.execute(inv.id);
    expect(dto.linesSummary!.totalWithVat).toBe(0);
    expect(dto.linesSummary!.totalsMismatch).toBe(true);
  });

  it("linesSummary agrega corretamente múltiplas linhas", async () => {
    const inv = makeDetailedInvoice({ subtotalWithoutVat: 20000, totalVat: 4600, totalWithVat: 24600 });
    await invoiceRepo.save(inv);
    await lineRepo.saveAll([
      makeLine(inv.id, 12300, 2300), // subtotal 10000
      makeLine(inv.id, 12300, 2300), // subtotal 10000
    ]);

    const dto = await useCase.execute(inv.id);
    expect(dto.linesSummary!.totalWithVat).toBe(24600);
    expect(dto.linesSummary!.totalVat).toBe(4600);
    expect(dto.linesSummary!.subtotalWithoutVat).toBe(20000);
    expect(dto.linesSummary!.totalsMismatch).toBe(false);
  });
});
