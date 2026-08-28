import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { CreatePayableEntryUseCase } from "../../application/use-cases/create-payable-entry.use-case.js";
import { MarkPayableAsPaidUseCase } from "../../application/use-cases/mark-payable-as-paid.use-case.js";
import { GetPayableSummaryUseCase } from "../../application/use-cases/get-payable-summary.use-case.js";
import { FakePayableEntryRepository } from "../fakes/fake-payable-entry-repository.js";

describe("GetPayableSummaryUseCase", () => {
  const organizationId = mintOrganizationId("org-a");

  it("returns correct KPI values", async () => {
    const repo = new FakePayableEntryRepository();
    const create = new CreatePayableEntryUseCase(repo);
    const markPaid = new MarkPayableAsPaidUseCase(repo);

    const e1 = await create.execute({ organizationId, supplierName: "A", description: "D", amount: 20000, dueDate: "2026-07-15" });
    const e2 = await create.execute({ organizationId, supplierName: "B", description: "D", amount: 10000, dueDate: "2026-07-25" });
    await markPaid.execute({ organizationId, id: e2.id, paidAt: new Date().toISOString().slice(0, 10) });

    const uc = new GetPayableSummaryUseCase(repo);
    const summary = await uc.execute({ organizationId });

    expect(summary.totalDue).toBe(20000);
    expect(summary.totalOverdue).toBe(0);
    expect(summary.paidThisMonth).toBe(10000);
  });
});
