import { CreatePayableEntryUseCase } from "../../application/use-cases/create-payable-entry.use-case.js";
import { GetPayableEntryUseCase } from "../../application/use-cases/get-payable-entry.use-case.js";
import { FakePayableEntryRepository } from "../fakes/fake-payable-entry-repository.js";
import { PayableEntryNotFoundError } from "../../domain/errors.js";

describe("GetPayableEntryUseCase", () => {
  it("returns the DTO for an existing entry", async () => {
    const repo = new FakePayableEntryRepository();
    const created = await new CreatePayableEntryUseCase(repo).execute({
      supplierName: "Makro",
      description: "Stock maio",
      amount: 80000,
      dueDate: "2026-05-15",
    });

    const dto = await new GetPayableEntryUseCase(repo).execute(created.id);
    expect(dto.id).toBe(created.id);
    expect(dto.supplierName).toBe("Makro");
    expect(dto.amount).toBe(80000);
  });

  it("throws PayableEntryNotFoundError for unknown id", async () => {
    const repo = new FakePayableEntryRepository();
    await expect(
      new GetPayableEntryUseCase(repo).execute("does-not-exist"),
    ).rejects.toThrow(PayableEntryNotFoundError);
  });
});
