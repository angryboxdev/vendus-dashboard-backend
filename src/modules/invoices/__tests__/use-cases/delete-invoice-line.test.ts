import { DeleteInvoiceLineUseCase } from "../../application/use-cases/delete-invoice-line.use-case.js";
import { FakeInvoiceRepository } from "../fakes/fake-invoice-repository.js";
import { FakeInvoiceLineRepository } from "../fakes/fake-invoice-line-repository.js";
import { Invoice } from "../../domain/entities/invoice.js";
import { InvoiceLine } from "../../domain/entities/invoice-line.js";
import { InvoiceNotFoundError, InvoiceLineNotFoundError, LineDetailModeError } from "../../domain/errors.js";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";

const ORG_ID = mintOrganizationId("org-test");

function makeDetailedInvoice() {
  const inv = Invoice.create({
    supplierName: "Makro",
    invoiceNumber: "MKR-001",
    invoiceDate: new Date("2026-06-01"),
    subtotalWithoutVat: 10000,
    totalVat: 2300,
    totalWithVat: 12300,
  });
  return inv.setLineDetailMode("detailed");
}

function makeLine(invoiceId: string) {
  return InvoiceLine.create({
    invoiceId,
    description: "Produto X",
    quantity: 1,
    unitCostWithoutVat: 10000,
    vatRate: 23,
    vatAmount: 2300,
    totalWithVat: 12300,
  });
}

describe("DeleteInvoiceLineUseCase", () => {
  let invoiceRepo: FakeInvoiceRepository;
  let lineRepo: FakeInvoiceLineRepository;
  let useCase: DeleteInvoiceLineUseCase;

  beforeEach(() => {
    invoiceRepo = new FakeInvoiceRepository();
    lineRepo = new FakeInvoiceLineRepository();
    useCase = new DeleteInvoiceLineUseCase(invoiceRepo, lineRepo);
  });

  it("apaga a linha do repositório", async () => {
    const inv = makeDetailedInvoice();
    const line = makeLine(inv.id);
    await invoiceRepo.save(ORG_ID, inv);
    await lineRepo.saveAll(ORG_ID, [line]);

    await useCase.execute(ORG_ID, inv.id, line.id);

    const remaining = await lineRepo.findByInvoiceId(ORG_ID, inv.id);
    expect(remaining).toHaveLength(0);
  });

  it("permite apagar uma de várias linhas, mantendo as restantes", async () => {
    const inv = makeDetailedInvoice();
    const lineA = makeLine(inv.id);
    const lineB = makeLine(inv.id);
    await invoiceRepo.save(ORG_ID, inv);
    await lineRepo.saveAll(ORG_ID, [lineA, lineB]);

    await useCase.execute(ORG_ID, inv.id, lineA.id);

    const remaining = await lineRepo.findByInvoiceId(ORG_ID, inv.id);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(lineB.id);
  });

  it("lança InvoiceNotFoundError para fatura inexistente", async () => {
    await expect(
      useCase.execute(ORG_ID, "invoice-nao-existe", "line-qualquer"),
    ).rejects.toThrow(InvoiceNotFoundError);
  });

  it("lança LineDetailModeError quando a fatura está em modo simples", async () => {
    const inv = Invoice.create({
      supplierName: "EDP",
      invoiceNumber: "EDP-001",
      invoiceDate: new Date("2026-06-01"),
      subtotalWithoutVat: 1000,
      totalVat: 230,
      totalWithVat: 1230,
      // lineDetailMode defaults to "simple"
    });
    const line = makeLine(inv.id);
    await invoiceRepo.save(ORG_ID, inv);
    await lineRepo.saveAll(ORG_ID, [line]);

    await expect(
      useCase.execute(ORG_ID, inv.id, line.id),
    ).rejects.toThrow(LineDetailModeError);
  });

  it("lança InvoiceLineNotFoundError quando a linha não pertence à fatura", async () => {
    const inv = makeDetailedInvoice();
    await invoiceRepo.save(ORG_ID, inv);
    // Nenhuma linha guardada

    await expect(
      useCase.execute(ORG_ID, inv.id, "line-nao-existe"),
    ).rejects.toThrow(InvoiceLineNotFoundError);
  });

  it("lança InvoiceLineNotFoundError quando a linha pertence a outra fatura", async () => {
    const inv = makeDetailedInvoice();
    const outraFatura = makeDetailedInvoice();
    const lineDeOutra = makeLine(outraFatura.id);
    await invoiceRepo.save(ORG_ID, inv);
    await invoiceRepo.save(ORG_ID, outraFatura);
    await lineRepo.saveAll(ORG_ID, [lineDeOutra]);

    await expect(
      useCase.execute(ORG_ID, inv.id, lineDeOutra.id),
    ).rejects.toThrow(InvoiceLineNotFoundError);
  });
});
