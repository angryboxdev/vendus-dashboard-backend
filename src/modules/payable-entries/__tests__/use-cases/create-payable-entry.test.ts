import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { CreatePayableEntryUseCase } from "../../application/use-cases/create-payable-entry.use-case.js";
import { FakePayableEntryRepository } from "../fakes/fake-payable-entry-repository.js";

describe("CreatePayableEntryUseCase", () => {
  const organizationId = mintOrganizationId("org-a");

  it("creates and persists a payable entry", async () => {
    const repo = new FakePayableEntryRepository();
    const uc = new CreatePayableEntryUseCase(repo);

    const dto = await uc.execute({
      organizationId,
      supplierName: "EDP",
      description: "Eletricidade julho",
      amount: 25000,
      dueDate: "2026-07-31",
    });

    expect(dto.status).toBe("pending");
    expect(dto.supplierName).toBe("EDP");
    expect(dto.amount).toBe(25000);
    expect(dto.dueDate).toBe("2026-07-31");
    expect(dto.recurrence).toBe("none");

    const saved = await repo.findById(organizationId, dto.id);
    expect(saved).not.toBeNull();
  });

  it("propagates domain error for invalid amount", async () => {
    const repo = new FakePayableEntryRepository();
    const uc = new CreatePayableEntryUseCase(repo);
    await expect(
      uc.execute({ organizationId, supplierName: "X", description: "Y", amount: 0, dueDate: "2026-07-01" }),
    ).rejects.toThrow("Amount must be greater than zero");
  });
});
