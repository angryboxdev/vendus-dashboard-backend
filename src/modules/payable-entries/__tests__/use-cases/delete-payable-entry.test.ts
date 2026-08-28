import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { CreatePayableEntryUseCase } from "../../application/use-cases/create-payable-entry.use-case.js";
import { CancelPayableEntryUseCase } from "../../application/use-cases/cancel-payable-entry.use-case.js";
import { MarkPayableAsPaidUseCase } from "../../application/use-cases/mark-payable-as-paid.use-case.js";
import { DeletePayableEntryUseCase } from "../../application/use-cases/delete-payable-entry.use-case.js";
import { FakePayableEntryRepository } from "../fakes/fake-payable-entry-repository.js";
import { FakeInvoiceRead } from "../fakes/fake-invoice-read.js";
import {
  PayableEntryNotFoundError,
  PayableEntryCannotDeleteError,
} from "../../domain/errors.js";

const organizationId = mintOrganizationId("org-a");

async function createEntry(repo: FakePayableEntryRepository) {
  return new CreatePayableEntryUseCase(repo).execute({
    organizationId,
    supplierName: "NOS",
    description: "Internet julho",
    amount: 4500,
    dueDate: "2026-07-31",
  });
}

describe("DeletePayableEntryUseCase", () => {
  it("deletes a cancelled entry and removes it from the repository", async () => {
    const repo = new FakePayableEntryRepository();
    const created = await createEntry(repo);
    await new CancelPayableEntryUseCase(repo).execute({ organizationId, id: created.id });

    await new DeletePayableEntryUseCase(repo).execute({ organizationId, id: created.id });

    const found = await repo.findById(organizationId, created.id);
    expect(found).toBeNull();
  });

  it("throws PayableEntryNotFoundError for unknown id", async () => {
    const repo = new FakePayableEntryRepository();
    await expect(
      new DeletePayableEntryUseCase(repo).execute({ organizationId, id: "does-not-exist" }),
    ).rejects.toThrow(PayableEntryNotFoundError);
  });

  it("throws PayableEntryCannotDeleteError for a pending entry", async () => {
    const repo = new FakePayableEntryRepository();
    const created = await createEntry(repo); // status: pending

    await expect(
      new DeletePayableEntryUseCase(repo).execute({ organizationId, id: created.id }),
    ).rejects.toThrow(PayableEntryCannotDeleteError);
  });

  it("throws PayableEntryCannotDeleteError for a paid entry", async () => {
    const repo = new FakePayableEntryRepository();
    const created = await createEntry(repo);
    await new MarkPayableAsPaidUseCase(repo, new FakeInvoiceRead()).execute({
      organizationId,
      id: created.id,
    });

    await expect(
      new DeletePayableEntryUseCase(repo).execute({ organizationId, id: created.id }),
    ).rejects.toThrow(PayableEntryCannotDeleteError);
  });
});
