import { AddInvoiceLineUseCase } from "../../application/use-cases/add-invoice-line.use-case.js";
import { FakeInvoiceRepository } from "../fakes/fake-invoice-repository.js";
import { FakeInvoiceLineRepository } from "../fakes/fake-invoice-line-repository.js";
import { Invoice } from "../../domain/entities/invoice.js";
import { InvoiceNotFoundError, LineDetailModeError, LinesTotalMismatchError } from "../../domain/errors.js";

/** Cria uma fatura em modo detalhado com os totais fornecidos */
function makeDetailedInvoice(props: {
  subtotalWithoutVat: number;
  totalVat: number;
  totalWithVat: number;
}) {
  return Invoice.create({
    supplierName: "Makro Portugal",
    invoiceNumber: "MKR-001",
    invoiceDate: new Date("2026-06-01"),
    lineDetailMode: "detailed",
    ...props,
  });
}

describe("AddInvoiceLineUseCase", () => {
  let invoiceRepo: FakeInvoiceRepository;
  let lineRepo: FakeInvoiceLineRepository;
  let useCase: AddInvoiceLineUseCase;

  beforeEach(async () => {
    invoiceRepo = new FakeInvoiceRepository();
    lineRepo = new FakeInvoiceLineRepository();
    useCase = new AddInvoiceLineUseCase(invoiceRepo, lineRepo);
  });

  it("adds a line and returns its DTO when totals match", async () => {
    const invoice = makeDetailedInvoice({ subtotalWithoutVat: 5000, totalVat: 300, totalWithVat: 5300 });
    await invoiceRepo.save(invoice);

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
    expect(dto.totalWithVat).toBe(5300);
  });

  it("defaults type to 'other' when not provided", async () => {
    const invoice = makeDetailedInvoice({ subtotalWithoutVat: 1000, totalVat: 230, totalWithVat: 1230 });
    await invoiceRepo.save(invoice);

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
    const invoice = makeDetailedInvoice({ subtotalWithoutVat: 8500, totalVat: 510, totalWithVat: 9010 });
    await invoiceRepo.save(invoice);

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
    const invoice = makeDetailedInvoice({ subtotalWithoutVat: 2000, totalVat: 120, totalWithVat: 2120 });
    await invoiceRepo.save(invoice);

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

  it("persists unit when provided", async () => {
    const invoice = makeDetailedInvoice({ subtotalWithoutVat: 3000, totalVat: 180, totalWithVat: 3180 });
    await invoiceRepo.save(invoice);

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
    const invoice = makeDetailedInvoice({ subtotalWithoutVat: 5000, totalVat: 300, totalWithVat: 5300 });
    await invoiceRepo.save(invoice);

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

  it("can add multiple lines when their sum matches the invoice total", async () => {
    // Fatura: 2460 total = 1230 linha A + 1230 linha B
    const invoice = makeDetailedInvoice({ subtotalWithoutVat: 2000, totalVat: 460, totalWithVat: 2460 });
    await invoiceRepo.save(invoice);

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
      quantity: 1,
      unitCostWithoutVat: 1000,
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

  // ── Modo simples ────────────────────────────────────────────────────────────

  it("throws LineDetailModeError if invoice is in simple mode", async () => {
    const invoice = Invoice.create({
      supplierName: "EDP",
      invoiceNumber: "EDP-001",
      invoiceDate: new Date("2026-06-01"),
      subtotalWithoutVat: 1000,
      totalVat: 230,
      totalWithVat: 1230,
      // lineDetailMode defaults to "simple"
    });
    await invoiceRepo.save(invoice);

    await expect(
      useCase.execute({
        invoiceId: invoice.id,
        description: "Linha",
        quantity: 1,
        unitCostWithoutVat: 1000,
        vatRate: 23,
        vatAmount: 230,
        totalWithVat: 1230,
      }),
    ).rejects.toThrow(LineDetailModeError);
  });

  // ── Validação de totais ─────────────────────────────────────────────────────

  it("throws LinesTotalMismatchError when a single line exceeds the invoice total", async () => {
    const invoice = makeDetailedInvoice({ subtotalWithoutVat: 1000, totalVat: 230, totalWithVat: 1230 });
    await invoiceRepo.save(invoice);

    await expect(
      useCase.execute({
        invoiceId: invoice.id,
        description: "Linha",
        quantity: 1,
        unitCostWithoutVat: 2000,
        vatRate: 23,
        vatAmount: 460,
        totalWithVat: 2460, // excede o total da fatura (1230)
      }),
    ).rejects.toThrow(LinesTotalMismatchError);
  });

  it("throws LinesTotalMismatchError when second line would exceed invoice total", async () => {
    const invoice = makeDetailedInvoice({ subtotalWithoutVat: 1000, totalVat: 230, totalWithVat: 1230 });
    await invoiceRepo.save(invoice);

    // Primeira linha adiciona 615 — metade do total
    await useCase.execute({
      invoiceId: invoice.id,
      description: "Linha A",
      quantity: 1,
      unitCostWithoutVat: 500,
      vatRate: 23,
      vatAmount: 115,
      totalWithVat: 615,
    });

    // Segunda linha também 615 — soma ficaria 1230, OK
    await useCase.execute({
      invoiceId: invoice.id,
      description: "Linha B",
      quantity: 1,
      unitCostWithoutVat: 500,
      vatRate: 23,
      vatAmount: 115,
      totalWithVat: 615,
    });

    // Terceira linha — excederia o total
    await expect(
      useCase.execute({
        invoiceId: invoice.id,
        description: "Linha C — excesso",
        quantity: 1,
        unitCostWithoutVat: 500,
        vatRate: 23,
        vatAmount: 115,
        totalWithVat: 615,
      }),
    ).rejects.toThrow(LinesTotalMismatchError);
  });

  it("accepts a line within the 1-cent rounding tolerance", async () => {
    const invoice = makeDetailedInvoice({ subtotalWithoutVat: 999, totalVat: 230, totalWithVat: 1229 });
    await invoiceRepo.save(invoice);

    // totalWithVat da linha = 1230, fatura = 1229 → diferença = 1 cêntimo (dentro da tolerância)
    const dto = await useCase.execute({
      invoiceId: invoice.id,
      description: "Linha com arredondamento",
      quantity: 1,
      unitCostWithoutVat: 999,
      vatRate: 23,
      vatAmount: 230,
      totalWithVat: 1230,
    });

    expect(dto.id).toBeDefined();
  });
});
