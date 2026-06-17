import { CreatePayableEntryUseCase } from "../../application/use-cases/create-payable-entry.use-case.js";
import { MarkPayableAsPaidUseCase } from "../../application/use-cases/mark-payable-as-paid.use-case.js";
import { FakePayableEntryRepository } from "../fakes/fake-payable-entry-repository.js";
import { FakeInvoiceRead } from "../fakes/fake-invoice-read.js";
import { PayableEntry } from "../../domain/entities/payable-entry.js";
import { PayableEntryNotFoundError } from "../../domain/errors.js";

function makeUseCase(repo: FakePayableEntryRepository, invoiceGateway = new FakeInvoiceRead()) {
  return { uc: new MarkPayableAsPaidUseCase(repo, invoiceGateway), invoiceGateway };
}

async function createEntry(repo: FakePayableEntryRepository) {
  const uc = new CreatePayableEntryUseCase(repo);
  return uc.execute({ supplierName: "X", description: "Y", amount: 1000, dueDate: "2026-07-01" });
}

describe("MarkPayableAsPaidUseCase", () => {
  it("marks entry as paid with provided date", async () => {
    const repo = new FakePayableEntryRepository();
    const created = await createEntry(repo);
    const { uc } = makeUseCase(repo);

    const paid = await uc.execute({ id: created.id, paidAt: "2026-07-05" });
    expect(paid.status).toBe("paid");
    expect(paid.paidAt).toBe("2026-07-05");
  });

  it("uses today when paidAt is not provided", async () => {
    const repo = new FakePayableEntryRepository();
    const created = await createEntry(repo);
    const { uc } = makeUseCase(repo);

    const paid = await uc.execute({ id: created.id });
    expect(paid.status).toBe("paid");
    expect(paid.paidAt).toBe(new Date().toISOString().slice(0, 10));
  });

  it("throws when entry is not found", async () => {
    const repo = new FakePayableEntryRepository();
    const { uc } = makeUseCase(repo);
    await expect(uc.execute({ id: "missing" })).rejects.toThrow(PayableEntryNotFoundError);
  });

  it("throws when entry is already paid", async () => {
    const repo = new FakePayableEntryRepository();
    const created = await createEntry(repo);
    const { uc } = makeUseCase(repo);
    await uc.execute({ id: created.id });
    await expect(uc.execute({ id: created.id })).rejects.toThrow("already paid");
  });

  it("syncs linked invoice as paid when invoiceId is set", async () => {
    const repo = new FakePayableEntryRepository();
    const invoiceGateway = new FakeInvoiceRead();
    const { uc } = makeUseCase(repo, invoiceGateway);

    // Criar entrada com invoiceId directamente via reconstitute
    const entry = PayableEntry.reconstitute({
      id: crypto.randomUUID(),
      invoiceId: "inv-123",
      supplierId: null,
      supplierName: "EDP",
      description: "Fatura EDP-001",
      costCenterId: null,
      category: null,
      amount: 9000,
      dueDate: new Date("2026-07-31"),
      paidAt: null,
      recurrence: "none",
      status: "pending",
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await repo.save(entry);

    await uc.execute({ id: entry.id, paidAt: "2026-07-10" });
    expect(invoiceGateway.markedPaid).toHaveLength(1);
    expect(invoiceGateway.markedPaid[0]!.invoiceId).toBe("inv-123");
  });

  it("does NOT sync invoice when invoiceId is null", async () => {
    const repo = new FakePayableEntryRepository();
    const invoiceGateway = new FakeInvoiceRead();
    const created = await createEntry(repo); // sem invoiceId
    const { uc } = makeUseCase(repo, invoiceGateway);
    await uc.execute({ id: created.id });
    expect(invoiceGateway.markedPaid).toHaveLength(0);
  });
});
