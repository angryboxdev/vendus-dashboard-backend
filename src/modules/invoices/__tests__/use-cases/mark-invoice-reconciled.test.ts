import { MarkInvoiceReconciledUseCase } from "../../application/use-cases/mark-invoice-reconciled.use-case.js";
import { FakeInvoiceRepository } from "../fakes/fake-invoice-repository.js";
import { Invoice } from "../../domain/entities/invoice.js";
import {
  InvoiceNotFoundError,
  InvoiceNotPaidError,
  InvoiceAlreadyReconciledError,
} from "../../domain/errors.js";

const makeInvoice = () =>
  Invoice.create({
    supplierName: "NOS",
    invoiceNumber: "NOS-001",
    invoiceDate: new Date("2026-06-01"),
    subtotalWithoutVat: 50000,
    totalVat: 11500,
    totalWithVat: 61500,
  });

describe("MarkInvoiceReconciledUseCase", () => {
  let invoiceRepo: FakeInvoiceRepository;
  let useCase: MarkInvoiceReconciledUseCase;

  beforeEach(() => {
    invoiceRepo = new FakeInvoiceRepository();
    useCase = new MarkInvoiceReconciledUseCase(invoiceRepo);
  });

  it("reconciles a paid invoice", async () => {
    const inv = makeInvoice().markPaid(new Date("2026-06-15"));
    await invoiceRepo.save(inv);

    const dto = await useCase.execute({ id: inv.id });
    expect(dto.reconciliationStatus).toBe("reconciled");
  });

  it("throws InvoiceNotFoundError when invoice does not exist", async () => {
    await expect(useCase.execute({ id: "nonexistent" })).rejects.toThrow(InvoiceNotFoundError);
  });

  it("throws InvoiceNotPaidError if invoice is not yet paid", async () => {
    const inv = makeInvoice();
    await invoiceRepo.save(inv);
    await expect(useCase.execute({ id: inv.id })).rejects.toThrow(InvoiceNotPaidError);
  });

  it("throws InvoiceAlreadyReconciledError if already reconciled", async () => {
    const inv = makeInvoice().markPaid(new Date("2026-06-15")).markReconciled();
    await invoiceRepo.save(inv);
    await expect(useCase.execute({ id: inv.id })).rejects.toThrow(InvoiceAlreadyReconciledError);
  });
});
