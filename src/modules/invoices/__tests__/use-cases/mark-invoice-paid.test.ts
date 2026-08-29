import { MarkInvoicePaidUseCase } from "../../application/use-cases/mark-invoice-paid.use-case.js";
import { FakeInvoiceRepository } from "../fakes/fake-invoice-repository.js";
import { FakePayableEntryWrite } from "../fakes/fake-payable-entry-write.js";
import { FakeOccurrenceSync } from "../fakes/fake-occurrence-sync.js";
import { Invoice } from "../../domain/entities/invoice.js";
import { InvoiceNotFoundError } from "../../domain/errors.js";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";

const ORG_ID = mintOrganizationId("org-test");

const makeInvoice = () =>
  Invoice.create({
    supplierName: "EDP",
    invoiceNumber: "EDP-001",
    invoiceDate: new Date("2026-06-01"),
    subtotalWithoutVat: 85000,
    totalVat: 5100,
    totalWithVat: 90100,
  });

describe("MarkInvoicePaidUseCase", () => {
  let invoiceRepo: FakeInvoiceRepository;
  let payableWrite: FakePayableEntryWrite;
  let occurrenceSync: FakeOccurrenceSync;
  let useCase: MarkInvoicePaidUseCase;

  beforeEach(() => {
    invoiceRepo = new FakeInvoiceRepository();
    payableWrite = new FakePayableEntryWrite();
    occurrenceSync = new FakeOccurrenceSync();
    useCase = new MarkInvoicePaidUseCase(invoiceRepo, payableWrite, occurrenceSync);
  });

  it("marks invoice as paid with provided date and sets reconciliation to pending", async () => {
    const inv = makeInvoice();
    await invoiceRepo.save(ORG_ID, inv);

    const dto = await useCase.execute({ organizationId: ORG_ID, id: inv.id, paidAt: "2026-06-15" });
    expect(dto.status).toBe("paid");
    expect(dto.paidAt).toBe("2026-06-15");
    expect(dto.reconciliationStatus).toBe("pending_reconciliation");
  });

  it("stores bankAccountId when provided", async () => {
    const inv = makeInvoice();
    await invoiceRepo.save(ORG_ID, inv);

    const dto = await useCase.execute({ organizationId: ORG_ID, id: inv.id, bankAccountId: "bank-xyz" });
    expect(dto.paymentBankAccountId).toBe("bank-xyz");
  });

  it("defaults paidAt to today when not provided", async () => {
    const inv = makeInvoice();
    await invoiceRepo.save(ORG_ID, inv);

    const dto = await useCase.execute({ organizationId: ORG_ID, id: inv.id });
    expect(dto.status).toBe("paid");
    expect(dto.paidAt).not.toBeNull();
  });

  it("throws InvoiceNotFoundError if invoice does not exist", async () => {
    await expect(useCase.execute({ organizationId: ORG_ID, id: "nonexistent" })).rejects.toThrow(InvoiceNotFoundError);
  });

  it("throws if invoice is cancelled", async () => {
    const inv = makeInvoice().cancel();
    await invoiceRepo.save(ORG_ID, inv);
    await expect(useCase.execute({ organizationId: ORG_ID, id: inv.id })).rejects.toThrow();
  });

  it("stores paymentMethod when provided", async () => {
    const inv = makeInvoice();
    await invoiceRepo.save(ORG_ID, inv);

    const dto = await useCase.execute({ organizationId: ORG_ID, id: inv.id, paymentMethod: "bank_transfer" });
    expect(dto.paymentMethod).toBe("bank_transfer");
  });

  it("stores paymentNotes when provided", async () => {
    const inv = makeInvoice();
    await invoiceRepo.save(ORG_ID, inv);

    const dto = await useCase.execute({ organizationId: ORG_ID, id: inv.id, paymentNotes: "Pago via homebanking" });
    expect(dto.paymentNotes).toBe("Pago via homebanking");
  });

  it("syncs the linked payable entry as paid", async () => {
    const inv = makeInvoice();
    await invoiceRepo.save(ORG_ID, inv);
    await useCase.execute({ organizationId: ORG_ID, id: inv.id, paidAt: "2026-07-05" });
    expect(payableWrite.markedPaid).toHaveLength(1);
    expect(payableWrite.markedPaid[0]!.invoiceId).toBe(inv.id);
    expect(payableWrite.markedPaid[0]!.paidAt).toEqual(new Date("2026-07-05"));
  });
});
