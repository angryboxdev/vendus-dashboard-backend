import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { GetSupplierStatementUseCase } from "../../application/use-cases/get-supplier-statement.use-case.js";
import { FakeSupplierRepository } from "../fakes/fake-supplier-repository.js";
import { FakeSupplierInvoiceStats } from "../fakes/fake-supplier-invoice-stats.js";
import { Supplier } from "../../domain/entities/supplier.js";
import { SupplierNotFoundError } from "../../domain/errors.js";

const ORG_ID = mintOrganizationId("org-test");

const makeInvoice = (overrides: {
  id: string;
  invoiceNumber: string;
  invoiceDate: Date;
  status: string;
  totalWithVat: number;
  paidAt?: Date | null;
}) => ({
  id: overrides.id,
  invoiceNumber: overrides.invoiceNumber,
  invoiceDate: overrides.invoiceDate,
  dueDate: null,
  totalWithoutVat: overrides.totalWithVat / 1.23,
  vatAmount: overrides.totalWithVat - overrides.totalWithVat / 1.23,
  totalWithVat: overrides.totalWithVat,
  status: overrides.status,
  paidAt: overrides.paidAt ?? null,
  attachmentUrl: null,
});

describe("GetSupplierStatementUseCase", () => {
  it("lança SupplierNotFoundError para id inexistente", async () => {
    const useCase = new GetSupplierStatementUseCase(
      new FakeSupplierRepository(),
      new FakeSupplierInvoiceStats(),
    );
    await expect(
      useCase.execute({ organizationId: ORG_ID, id: "inexistente" }),
    ).rejects.toThrow(SupplierNotFoundError);
  });

  it("devolve extrato vazio quando não há faturas", async () => {
    const repo = new FakeSupplierRepository();
    const s = Supplier.create({ name: "Makro" });
    await repo.save(ORG_ID, s);

    const useCase = new GetSupplierStatementUseCase(repo, new FakeSupplierInvoiceStats());
    const result = await useCase.execute({ organizationId: ORG_ID, id: s.id });

    expect(result.supplier.name).toBe("Makro");
    expect(result.invoices).toHaveLength(0);
    expect(result.stats.totalBilled).toBe(0);
    expect(result.period).toEqual({ startDate: null, endDate: null });
  });

  it("calcula stats sobre as faturas filtradas (sem chamar getSummariesForSuppliers)", async () => {
    const repo = new FakeSupplierRepository();
    const statsPort = new FakeSupplierInvoiceStats();
    const s = Supplier.create({ name: "Makro" });
    await repo.save(ORG_ID, s);

    const jan = makeInvoice({ id: "i1", invoiceNumber: "F001", invoiceDate: new Date("2026-01-10"), status: "paid", totalWithVat: 500, paidAt: new Date("2026-01-20") });
    const feb = makeInvoice({ id: "i2", invoiceNumber: "F002", invoiceDate: new Date("2026-02-15"), status: "pending", totalWithVat: 300 });
    const mar = makeInvoice({ id: "i3", invoiceNumber: "F003", invoiceDate: new Date("2026-03-05"), status: "pending", totalWithVat: 200 });

    statsPort.seed(
      { supplierId: s.id, invoiceCount: 3, totalBilled: 1000, totalPaid: 500, totalPending: 500, lastInvoiceDate: new Date("2026-03-05"), lastPaymentDate: new Date("2026-01-20") },
      [jan, feb, mar],
    );

    // Filtra apenas Jan–Fev (exclui Mar)
    const useCase = new GetSupplierStatementUseCase(repo, statsPort);
    const result = await useCase.execute({
      organizationId: ORG_ID,
      id: s.id,
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-02-28"),
    });

    expect(result.invoices).toHaveLength(2);
    expect(result.stats.invoiceCount).toBe(2);
    expect(result.stats.totalBilled).toBe(800);
    expect(result.stats.totalPaid).toBe(500);
    expect(result.stats.totalPending).toBe(300);
    expect(result.period).toEqual({ startDate: new Date("2026-01-01"), endDate: new Date("2026-02-28") });
  });

  it("devolve histórico completo quando não há filtro de datas", async () => {
    const repo = new FakeSupplierRepository();
    const statsPort = new FakeSupplierInvoiceStats();
    const s = Supplier.create({ name: "Fornecedor A" });
    await repo.save(ORG_ID, s);

    statsPort.seed(
      { supplierId: s.id, invoiceCount: 1, totalBilled: 100, totalPaid: 100, totalPending: 0, lastInvoiceDate: new Date("2026-06-01"), lastPaymentDate: new Date("2026-06-10") },
      [makeInvoice({ id: "i1", invoiceNumber: "F001", invoiceDate: new Date("2026-06-01"), status: "paid", totalWithVat: 100, paidAt: new Date("2026-06-10") })],
    );

    const useCase = new GetSupplierStatementUseCase(repo, statsPort);
    const result = await useCase.execute({ organizationId: ORG_ID, id: s.id });

    expect(result.invoices).toHaveLength(1);
    expect(result.stats.totalBilled).toBe(100);
    expect(result.period).toEqual({ startDate: null, endDate: null });
  });

  it("fatura cancelada aparece na lista mas não conta em invoiceCount nem totalBilled", async () => {
    const repo = new FakeSupplierRepository();
    const statsPort = new FakeSupplierInvoiceStats();
    const s = Supplier.create({ name: "Fornecedor B" });
    await repo.save(ORG_ID, s);

    statsPort.seed(
      { supplierId: s.id, invoiceCount: 0, totalBilled: 0, totalPaid: 0, totalPending: 0, lastInvoiceDate: null, lastPaymentDate: null },
      [
        makeInvoice({ id: "i1", invoiceNumber: "F001", invoiceDate: new Date("2026-05-01"), status: "paid", totalWithVat: 200, paidAt: new Date("2026-05-10") }),
        makeInvoice({ id: "i2", invoiceNumber: "F002", invoiceDate: new Date("2026-05-15"), status: "cancelled", totalWithVat: 150 }),
      ],
    );

    const useCase = new GetSupplierStatementUseCase(repo, statsPort);
    const result = await useCase.execute({ organizationId: ORG_ID, id: s.id });

    // Fatura cancelada aparece na lista
    expect(result.invoices).toHaveLength(2);
    // Mas não entra nos totais
    expect(result.stats.invoiceCount).toBe(1);
    expect(result.stats.totalBilled).toBe(200);
    expect(result.stats.totalPaid).toBe(200);
    expect(result.stats.totalPending).toBe(0);
  });

  it("fatura partial conta em totalBilled e totalPending simultaneamente", async () => {
    const repo = new FakeSupplierRepository();
    const statsPort = new FakeSupplierInvoiceStats();
    const s = Supplier.create({ name: "Fornecedor C" });
    await repo.save(ORG_ID, s);

    statsPort.seed(
      { supplierId: s.id, invoiceCount: 0, totalBilled: 0, totalPaid: 0, totalPending: 0, lastInvoiceDate: null, lastPaymentDate: null },
      [makeInvoice({ id: "i1", invoiceNumber: "F001", invoiceDate: new Date("2026-06-01"), status: "partial", totalWithVat: 400 })],
    );

    const useCase = new GetSupplierStatementUseCase(repo, statsPort);
    const result = await useCase.execute({ organizationId: ORG_ID, id: s.id });

    expect(result.stats.invoiceCount).toBe(1);
    expect(result.stats.totalBilled).toBe(400);
    expect(result.stats.totalPaid).toBe(0);
    expect(result.stats.totalPending).toBe(400); // partial entra em pending
  });

  it("filtro só com startDate exclui faturas anteriores", async () => {
    const repo = new FakeSupplierRepository();
    const statsPort = new FakeSupplierInvoiceStats();
    const s = Supplier.create({ name: "Fornecedor D" });
    await repo.save(ORG_ID, s);

    statsPort.seed(
      { supplierId: s.id, invoiceCount: 0, totalBilled: 0, totalPaid: 0, totalPending: 0, lastInvoiceDate: null, lastPaymentDate: null },
      [
        makeInvoice({ id: "i1", invoiceNumber: "F001", invoiceDate: new Date("2026-03-01"), status: "paid", totalWithVat: 100, paidAt: new Date("2026-03-10") }),
        makeInvoice({ id: "i2", invoiceNumber: "F002", invoiceDate: new Date("2026-06-01"), status: "pending", totalWithVat: 200 }),
      ],
    );

    const useCase = new GetSupplierStatementUseCase(repo, statsPort);
    const result = await useCase.execute({ organizationId: ORG_ID, id: s.id, startDate: new Date("2026-04-01") });

    expect(result.invoices).toHaveLength(1);
    expect(result.invoices[0]!.invoiceNumber).toBe("F002");
    expect(result.stats.totalBilled).toBe(200);
    expect(result.period).toEqual({ startDate: new Date("2026-04-01"), endDate: null });
  });
});
