import { GetSuppliersKpisUseCase } from "../../application/use-cases/get-suppliers-kpis.use-case.js";
import { FakeSupplierRepository } from "../fakes/fake-supplier-repository.js";
import { FakeSupplierInvoiceStats } from "../fakes/fake-supplier-invoice-stats.js";
import { Supplier } from "../../domain/entities/supplier.js";

describe("GetSuppliersKpisUseCase", () => {
  it("devolve zeros quando não há fornecedores", async () => {
    const useCase = new GetSuppliersKpisUseCase(
      new FakeSupplierRepository(),
      new FakeSupplierInvoiceStats(),
    );

    const result = await useCase.execute();

    expect(result).toEqual({
      totalActive: 0,
      totalInactive: 0,
      totalWithPending: 0,
      totalBilledAll: 0,
    });
  });

  it("conta ativos e inativos corretamente", async () => {
    const repo = new FakeSupplierRepository();
    await repo.save(Supplier.create({ name: "Ativo 1" }));
    await repo.save(Supplier.create({ name: "Ativo 2" }));
    await repo.save(Supplier.create({ name: "Inativo" }).deactivate());

    const useCase = new GetSuppliersKpisUseCase(repo, new FakeSupplierInvoiceStats());
    const result = await useCase.execute();

    expect(result.totalActive).toBe(2);
    expect(result.totalInactive).toBe(1);
  });

  it("calcula totalBilledAll como soma dos totalBilled de todos os fornecedores", async () => {
    const repo = new FakeSupplierRepository();
    const statsPort = new FakeSupplierInvoiceStats();

    const s1 = Supplier.create({ name: "Makro" });
    const s2 = Supplier.create({ name: "Meta" });
    await repo.save(s1);
    await repo.save(s2);

    statsPort.seed({
      supplierId: s1.id,
      invoiceCount: 5,
      totalBilled: 1000,
      totalPaid: 800,
      totalPending: 200,
      lastInvoiceDate: null,
      lastPaymentDate: null,
    });
    statsPort.seed({
      supplierId: s2.id,
      invoiceCount: 2,
      totalBilled: 500,
      totalPaid: 500,
      totalPending: 0,
      lastInvoiceDate: null,
      lastPaymentDate: null,
    });

    const useCase = new GetSuppliersKpisUseCase(repo, statsPort);
    const result = await useCase.execute();

    expect(result.totalBilledAll).toBe(1500);
  });

  it("conta totalWithPending como nº de fornecedores com totalPending > 0", async () => {
    const repo = new FakeSupplierRepository();
    const statsPort = new FakeSupplierInvoiceStats();

    const s1 = Supplier.create({ name: "Com pendências" });
    const s2 = Supplier.create({ name: "Tudo pago" });
    const s3 = Supplier.create({ name: "Sem faturas" });
    await repo.save(s1);
    await repo.save(s2);
    await repo.save(s3);

    statsPort.seed({
      supplierId: s1.id,
      invoiceCount: 3,
      totalBilled: 600,
      totalPaid: 200,
      totalPending: 400,
      lastInvoiceDate: null,
      lastPaymentDate: null,
    });
    statsPort.seed({
      supplierId: s2.id,
      invoiceCount: 2,
      totalBilled: 300,
      totalPaid: 300,
      totalPending: 0,
      lastInvoiceDate: null,
      lastPaymentDate: null,
    });
    // s3 não tem seed — fake devolve zeros

    const useCase = new GetSuppliersKpisUseCase(repo, statsPort);
    const result = await useCase.execute();

    expect(result.totalWithPending).toBe(1);
  });
});
