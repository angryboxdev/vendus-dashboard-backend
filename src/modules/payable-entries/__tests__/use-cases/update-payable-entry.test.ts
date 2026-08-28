import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { CreatePayableEntryUseCase } from "../../application/use-cases/create-payable-entry.use-case.js";
import { CancelPayableEntryUseCase } from "../../application/use-cases/cancel-payable-entry.use-case.js";
import { UpdatePayableEntryUseCase } from "../../application/use-cases/update-payable-entry.use-case.js";
import { FakePayableEntryRepository } from "../fakes/fake-payable-entry-repository.js";
import { PayableEntryNotFoundError } from "../../domain/errors.js";

const organizationId = mintOrganizationId("org-a");

async function createEntry(repo: FakePayableEntryRepository) {
  return new CreatePayableEntryUseCase(repo).execute({
    organizationId,
    supplierName: "EDP",
    description: "Eletricidade julho",
    amount: 12000,
    dueDate: "2026-07-31",
    recurrence: "monthly",
  });
}

describe("UpdatePayableEntryUseCase", () => {
  it("updates supplierName", async () => {
    const repo = new FakePayableEntryRepository();
    const created = await createEntry(repo);

    const dto = await new UpdatePayableEntryUseCase(repo).execute({
      organizationId,
      id: created.id,
      supplierName: "EDP SA",
    });
    expect(dto.supplierName).toBe("EDP SA");
  });

  it("updates amount", async () => {
    const repo = new FakePayableEntryRepository();
    const created = await createEntry(repo);

    const dto = await new UpdatePayableEntryUseCase(repo).execute({
      organizationId,
      id: created.id,
      amount: 15000,
    });
    expect(dto.amount).toBe(15000);
  });

  it("updates dueDate", async () => {
    const repo = new FakePayableEntryRepository();
    const created = await createEntry(repo);

    const dto = await new UpdatePayableEntryUseCase(repo).execute({
      organizationId,
      id: created.id,
      dueDate: "2026-08-31",
    });
    expect(dto.dueDate).toBe("2026-08-31");
  });

  it("updates recurrence", async () => {
    const repo = new FakePayableEntryRepository();
    const created = await createEntry(repo);

    const dto = await new UpdatePayableEntryUseCase(repo).execute({
      organizationId,
      id: created.id,
      recurrence: "quarterly",
    });
    expect(dto.recurrence).toBe("quarterly");
  });

  it("persists changes to the repository", async () => {
    const repo = new FakePayableEntryRepository();
    const created = await createEntry(repo);

    await new UpdatePayableEntryUseCase(repo).execute({
      organizationId,
      id: created.id,
      description: "Eletricidade agosto",
      amount: 13000,
    });

    const saved = await repo.findById(organizationId, created.id);
    expect(saved!.description).toBe("Eletricidade agosto");
    expect(saved!.amount).toBe(13000);
  });

  it("throws PayableEntryNotFoundError for unknown id", async () => {
    const repo = new FakePayableEntryRepository();
    await expect(
      new UpdatePayableEntryUseCase(repo).execute({
        organizationId,
        id: "does-not-exist",
        supplierName: "X",
      }),
    ).rejects.toThrow(PayableEntryNotFoundError);
  });

  it("throws PayableEntryNotFoundError when the entry belongs to another organization", async () => {
    const repo = new FakePayableEntryRepository();
    const created = await createEntry(repo);
    const otherOrganizationId = mintOrganizationId("org-b");

    await expect(
      new UpdatePayableEntryUseCase(repo).execute({
        organizationId: otherOrganizationId,
        id: created.id,
        supplierName: "X",
      }),
    ).rejects.toThrow(PayableEntryNotFoundError);
  });

  it("propagates domain error when updating a cancelled entry", async () => {
    const repo = new FakePayableEntryRepository();
    const created = await createEntry(repo);
    await new CancelPayableEntryUseCase(repo).execute({ organizationId, id: created.id });

    await expect(
      new UpdatePayableEntryUseCase(repo).execute({
        organizationId,
        id: created.id,
        amount: 5000,
      }),
    ).rejects.toThrow("cancelled");
  });

  it("propagates domain error when updating amount to zero", async () => {
    const repo = new FakePayableEntryRepository();
    const created = await createEntry(repo);

    await expect(
      new UpdatePayableEntryUseCase(repo).execute({
        organizationId,
        id: created.id,
        amount: 0,
      }),
    ).rejects.toThrow("Amount must be greater than zero");
  });
});
