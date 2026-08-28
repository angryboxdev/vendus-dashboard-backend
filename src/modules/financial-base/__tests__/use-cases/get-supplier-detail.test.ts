import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { GetSupplierDetailUseCase } from "../../application/use-cases/get-supplier-detail.use-case.js";
import { FakeSupplierRepository } from "../fakes/fake-supplier-repository.js";
import { FakeSupplierInvoiceStats } from "../fakes/fake-supplier-invoice-stats.js";
import { Supplier } from "../../domain/entities/supplier.js";
import { SupplierNotFoundError } from "../../domain/errors.js";

const ORG_ID = mintOrganizationId("org-test");

describe("GetSupplierDetailUseCase", () => {
  it("lança SupplierNotFoundError para id inexistente", async () => {
    const useCase = new GetSupplierDetailUseCase(
      new FakeSupplierRepository(),
      new FakeSupplierInvoiceStats(),
    );

    await expect(
      useCase.execute({ organizationId: ORG_ID, id: "inexistente" }),
    ).rejects.toThrow(SupplierNotFoundError);
  });

  it("devolve stats zeradas e lista vazia quando não há faturas", async () => {
    const repo = new FakeSupplierRepository();
    const s = Supplier.create({ name: "Makro" });
    await repo.save(ORG_ID, s);

    const useCase = new GetSupplierDetailUseCase(repo, new FakeSupplierInvoiceStats());
    const result = await useCase.execute({ organizationId: ORG_ID, id: s.id });

    expect(result.id).toBe(s.id);
    expect(result.name).toBe("Makro");
    expect(result.stats.invoiceCount).toBe(0);
    expect(result.stats.totalBilled).toBe(0);
    expect(result.stats.totalPaid).toBe(0);
    expect(result.stats.totalPending).toBe(0);
    expect(result.invoices).toEqual([]);
  });

  it("devolve resumo financeiro correto com lista de faturas", async () => {
    const repo = new FakeSupplierRepository();
    const statsPort = new FakeSupplierInvoiceStats();

    const s = Supplier.create({ name: "Makro", nif: "500123456" });
    await repo.save(ORG_ID, s);

    const lastInvoiceDate = new Date("2026-01-15");
    const lastPaymentDate = new Date("2026-01-20");

    statsPort.seed(
      {
        supplierId: s.id,
        invoiceCount: 2,
        totalBilled: 1000,
        totalPaid: 600,
        totalPending: 400,
        lastInvoiceDate,
        lastPaymentDate,
      },
      [
        {
          id: "inv-1",
          invoiceNumber: "F001",
          invoiceDate: new Date("2026-01-10"),
          dueDate: null,
          totalWithoutVat: 487.8,
          vatAmount: 112.2,
          totalWithVat: 600,
          status: "paid",
          paidAt: lastPaymentDate,
          attachmentUrl: null,
        },
        {
          id: "inv-2",
          invoiceNumber: "F002",
          invoiceDate: new Date("2026-01-15"),
          dueDate: new Date("2026-02-15"),
          totalWithoutVat: 325.2,
          vatAmount: 74.8,
          totalWithVat: 400,
          status: "pending",
          paidAt: null,
          attachmentUrl: null,
        },
      ],
    );

    const useCase = new GetSupplierDetailUseCase(repo, statsPort);
    const result = await useCase.execute({ organizationId: ORG_ID, id: s.id });

    expect(result.nif).toBe("500123456");
    expect(result.stats.invoiceCount).toBe(2);
    expect(result.stats.totalBilled).toBe(1000);
    expect(result.stats.totalPaid).toBe(600);
    expect(result.stats.totalPending).toBe(400);
    expect(result.stats.lastInvoiceDate).toEqual(lastInvoiceDate);
    expect(result.stats.lastPaymentDate).toEqual(lastPaymentDate);

    expect(result.invoices).toHaveLength(2);
    expect(result.invoices[0]!.invoiceNumber).toBe("F001");
    expect(result.invoices[0]!.totalWithoutVat).toBe(487.8);
    expect(result.invoices[0]!.vatAmount).toBe(112.2);
    expect(result.invoices[0]!.totalWithVat).toBe(600);
    expect(result.invoices[0]!.status).toBe("paid");
    expect(result.invoices[1]!.invoiceNumber).toBe("F002");
    expect(result.invoices[1]!.status).toBe("pending");
  });
});
