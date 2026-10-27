import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { GetCashFlowToHandleUseCase } from "../../application/use-cases/get-cash-flow-to-handle.use-case.js";

describe("GetCashFlowToHandleUseCase", () => {
  it("junta o resumo das contas a pagar e as faturas por rever da organização", async () => {
    const organizationId = mintOrganizationId("org-a");
    const seen: string[] = [];
    const uc = new GetCashFlowToHandleUseCase(
      { summary: async (org) => (seen.push(`p:${org}`), { dueCents: 278_672, overdueCents: 238_535 }) },
      { count: async (org) => (seen.push(`i:${org}`), 1) },
    );
    await expect(uc.execute({ organizationId })).resolves.toEqual({
      payables: { dueCents: 278_672, overdueCents: 238_535 },
      invoicesToReview: 1,
    });
    expect(seen.sort()).toEqual(["i:org-a", "p:org-a"]);
  });
});
