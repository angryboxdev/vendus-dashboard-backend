import { CreatePayableEntryUseCase } from "../../application/use-cases/create-payable-entry.use-case.js";
import { CancelPayableEntryUseCase } from "../../application/use-cases/cancel-payable-entry.use-case.js";
import { FakePayableEntryRepository } from "../fakes/fake-payable-entry-repository.js";
import { PayableEntry } from "../../domain/entities/payable-entry.js";
import { PayableEntryNotFoundError } from "../../domain/errors.js";

async function createEntry(repo: FakePayableEntryRepository) {
  return new CreatePayableEntryUseCase(repo).execute({
    supplierName: "EDP",
    description: "Eletricidade julho",
    amount: 10000,
    dueDate: "2026-07-31",
  });
}

describe("CancelPayableEntryUseCase", () => {
  it("cancels a pending entry and returns cancelled DTO", async () => {
    const repo = new FakePayableEntryRepository();
    const created = await createEntry(repo);
    const uc = new CancelPayableEntryUseCase(repo);

    const dto = await uc.execute(created.id);
    expect(dto.status).toBe("cancelled");
    expect(dto.id).toBe(created.id);
  });

  it("cancels an overdue entry", async () => {
    const repo = new FakePayableEntryRepository();
    const entry = PayableEntry.reconstitute({
      id: crypto.randomUUID(),
      invoiceId: null,
      supplierId: null,
      supplierName: "X",
      description: "Y",
      costCenterId: null,
      category: null,
      amount: 5000,
      dueDate: new Date("2026-01-01"),
      paidAt: null,
      recurrence: "none",
      status: "overdue",
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await repo.save(entry);

    const dto = await new CancelPayableEntryUseCase(repo).execute(entry.id);
    expect(dto.status).toBe("cancelled");
  });

  it("persists the cancelled status in the repository", async () => {
    const repo = new FakePayableEntryRepository();
    const created = await createEntry(repo);
    await new CancelPayableEntryUseCase(repo).execute(created.id);

    const saved = await repo.findById(created.id);
    expect(saved!.status).toBe("cancelled");
  });

  it("throws PayableEntryNotFoundError for unknown id", async () => {
    const repo = new FakePayableEntryRepository();
    await expect(
      new CancelPayableEntryUseCase(repo).execute("does-not-exist"),
    ).rejects.toThrow(PayableEntryNotFoundError);
  });

  it("is idempotent — cancelling an already-cancelled entry succeeds", async () => {
    const repo = new FakePayableEntryRepository();
    const created = await createEntry(repo);
    const uc = new CancelPayableEntryUseCase(repo);
    await uc.execute(created.id);

    // domain cancel() is idempotent; no error should be thrown
    const dto = await uc.execute(created.id);
    expect(dto.status).toBe("cancelled");
  });
});
