import { GetSupplierPlanningSummaryUseCase } from "../../application/use-cases/get-supplier-planning-summary.use-case.js";
import { SupplierNotFoundError } from "../../domain/errors.js";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";

const ORG = mintOrganizationId("org-test");

describe("GetSupplierPlanningSummaryUseCase", () => {
  it("lê os últimos 12 meses do fornecedor e calcula o resumo", async () => {
    const reads: { supplierId: string; since: string }[] = [];
    const uc = new GetSupplierPlanningSummaryUseCase(
      { findById: async (_o, id) => ({ id }) as never },
      { read: async (_o, supplierId, since) => { reads.push({ supplierId, since }); return { invoices: [{ id: "f", date: "2026-10-01", netCents: 1000 }], lines: [], stockPurchases: [] }; } },
      () => new Date("2026-10-25T12:00:00Z"),
    );
    const s = await uc.execute({ organizationId: ORG, supplierId: "s1" });
    expect(reads).toEqual([{ supplierId: "s1", since: "2025-10-25" }]);
    expect(s.purchasesLast3Months).toBe(10);
  });

  it("fornecedor inexistente → SupplierNotFoundError", async () => {
    const uc = new GetSupplierPlanningSummaryUseCase({ findById: async () => null }, { read: async () => { throw new Error("não devia ler"); } });
    await expect(uc.execute({ organizationId: ORG, supplierId: "x" })).rejects.toThrow(SupplierNotFoundError);
  });
});
