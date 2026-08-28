import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { ListSuppliersWithStatsUseCase } from "../../application/use-cases/list-suppliers-with-stats.use-case.js";
import { FakeSupplierRepository } from "../fakes/fake-supplier-repository.js";
import { FakeSupplierInvoiceStats } from "../fakes/fake-supplier-invoice-stats.js";
import { Supplier } from "../../domain/entities/supplier.js";

const ORG_ID = mintOrganizationId("org-test");

describe("ListSuppliersWithStatsUseCase", () => {
  it("devolve lista vazia quando não há fornecedores", async () => {
    const useCase = new ListSuppliersWithStatsUseCase(
      new FakeSupplierRepository(),
      new FakeSupplierInvoiceStats(),
    );

    const result = await useCase.execute({ organizationId: ORG_ID });

    expect(result).toEqual([]);
  });

  it("inclui stats zeradas para fornecedores sem faturas", async () => {
    const repo = new FakeSupplierRepository();
    await repo.save(ORG_ID, Supplier.create({ name: "Makro" }));

    const useCase = new ListSuppliersWithStatsUseCase(repo, new FakeSupplierInvoiceStats());
    const result = await useCase.execute({ organizationId: ORG_ID });

    expect(result).toHaveLength(1);
    expect(result[0]!.stats.invoiceCount).toBe(0);
    expect(result[0]!.stats.totalBilled).toBe(0);
    expect(result[0]!.stats.totalPending).toBe(0);
  });

  it("associa stats corretas a cada fornecedor", async () => {
    const repo = new FakeSupplierRepository();
    const statsPort = new FakeSupplierInvoiceStats();

    const s1 = Supplier.create({ name: "Makro" });
    const s2 = Supplier.create({ name: "Meta" });
    await repo.save(ORG_ID, s1);
    await repo.save(ORG_ID, s2);

    statsPort.seed({
      supplierId: s1.id,
      invoiceCount: 3,
      totalBilled: 900,
      totalPaid: 900,
      totalPending: 0,
      lastInvoiceDate: null,
      lastPaymentDate: null,
    });
    statsPort.seed({
      supplierId: s2.id,
      invoiceCount: 1,
      totalBilled: 200,
      totalPaid: 0,
      totalPending: 200,
      lastInvoiceDate: null,
      lastPaymentDate: null,
    });

    const useCase = new ListSuppliersWithStatsUseCase(repo, statsPort);
    const result = await useCase.execute({ organizationId: ORG_ID });

    const makro = result.find((r) => r.name === "Makro")!;
    const meta = result.find((r) => r.name === "Meta")!;

    expect(makro.stats.totalBilled).toBe(900);
    expect(makro.stats.totalPaid).toBe(900);
    expect(meta.stats.totalPending).toBe(200);
    expect(meta.stats.invoiceCount).toBe(1);
  });

  it("aplica filtro de status", async () => {
    const repo = new FakeSupplierRepository();
    await repo.save(ORG_ID, Supplier.create({ name: "Ativo" }));
    await repo.save(ORG_ID, Supplier.create({ name: "Inativo" }).deactivate());

    const useCase = new ListSuppliersWithStatsUseCase(repo, new FakeSupplierInvoiceStats());
    const result = await useCase.execute({ organizationId: ORG_ID, status: "active" });

    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("Ativo");
  });

  it("aplica filtro de pesquisa por nome", async () => {
    const repo = new FakeSupplierRepository();
    await repo.save(ORG_ID, Supplier.create({ name: "Makro Portugal" }));
    await repo.save(ORG_ID, Supplier.create({ name: "Meta Platforms" }));

    const useCase = new ListSuppliersWithStatsUseCase(repo, new FakeSupplierInvoiceStats());
    const result = await useCase.execute({ organizationId: ORG_ID, search: "makro" });

    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("Makro Portugal");
  });
});
