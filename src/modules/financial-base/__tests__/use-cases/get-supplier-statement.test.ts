import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { GetSupplierStatementUseCase } from "../../application/use-cases/get-supplier-statement.use-case.js";
import { FakeSupplierRepository } from "../fakes/fake-supplier-repository.js";
import { FakeSupplierInvoiceStats } from "../fakes/fake-supplier-invoice-stats.js";
import { FakeInvoicePaymentReadAdapter } from "../fakes/fake-invoice-payment-read.js";
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
  documentType?: string;
}) => ({
  id: overrides.id,
  invoiceNumber: overrides.invoiceNumber,
  invoiceDate: overrides.invoiceDate,
  dueDate: null,
  totalWithoutVat: overrides.totalWithVat / 1.23,
  vatAmount: overrides.totalWithVat - overrides.totalWithVat / 1.23,
  totalWithVat: overrides.totalWithVat,
  documentType: overrides.documentType ?? "invoice",
  status: overrides.status,
  paidAt: overrides.paidAt ?? null,
  attachmentUrl: null,
});

describe("GetSupplierStatementUseCase", () => {
  it("lança SupplierNotFoundError para id inexistente", async () => {
    const useCase = new GetSupplierStatementUseCase(
      new FakeSupplierRepository(),
      new FakeSupplierInvoiceStats(),
      new FakeInvoicePaymentReadAdapter(),
    );
    await expect(
      useCase.execute({ organizationId: ORG_ID, id: "inexistente" }),
    ).rejects.toThrow(SupplierNotFoundError);
  });

  it("devolve extrato vazio quando não há faturas", async () => {
    const repo = new FakeSupplierRepository();
    const s = Supplier.create({ name: "Makro" });
    await repo.save(ORG_ID, s);

    const useCase = new GetSupplierStatementUseCase(repo, new FakeSupplierInvoiceStats(), new FakeInvoicePaymentReadAdapter());
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
    const useCase = new GetSupplierStatementUseCase(repo, statsPort, new FakeInvoicePaymentReadAdapter());
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

    const useCase = new GetSupplierStatementUseCase(repo, statsPort, new FakeInvoicePaymentReadAdapter());
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

    const useCase = new GetSupplierStatementUseCase(repo, statsPort, new FakeInvoicePaymentReadAdapter());
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

    const useCase = new GetSupplierStatementUseCase(repo, statsPort, new FakeInvoicePaymentReadAdapter());
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

    const useCase = new GetSupplierStatementUseCase(repo, statsPort, new FakeInvoicePaymentReadAdapter());
    const result = await useCase.execute({ organizationId: ORG_ID, id: s.id, startDate: new Date("2026-04-01") });

    expect(result.invoices).toHaveLength(1);
    expect(result.invoices[0]!.invoiceNumber).toBe("F002");
    expect(result.stats.totalBilled).toBe(200);
    expect(result.period).toEqual({ startDate: new Date("2026-04-01"), endDate: null });
  });

  // ── Conta corrente (saldo, notas de crédito, liquidações) ──────────────────

  describe("conta corrente — saldo, notas de crédito e conciliação", () => {
    it("cenário Justdrinks (modelo enviado pelo utilizador): 5 faturas + 2 NC, sem pagamentos registados, fecha contra saldo informado 0€", async () => {
      const repo = new FakeSupplierRepository();
      const statsPort = new FakeSupplierInvoiceStats();
      const s = Supplier.create({ name: "Justdrinks Lda" });
      await repo.save(ORG_ID, s);

      const rows = [
        makeInvoice({ id: "i1", invoiceNumber: "Fac262/2628", invoiceDate: new Date("2026-05-05"), status: "pending", totalWithVat: 582.39 }),
        makeInvoice({ id: "i2", invoiceNumber: "Fac262/2760", invoiceDate: new Date("2026-05-08"), status: "pending", totalWithVat: 121.92 }),
        makeInvoice({ id: "i3", invoiceNumber: "Fac262/3318", invoiceDate: new Date("2026-05-29"), status: "pending", totalWithVat: 85.32 }),
        makeInvoice({ id: "i4", invoiceNumber: "Fac262/3503", invoiceDate: new Date("2026-06-08"), status: "pending", totalWithVat: 143.80 }),
        makeInvoice({ id: "i5", invoiceNumber: "Fac262/3513", invoiceDate: new Date("2026-06-08"), status: "pending", totalWithVat: 0 }),
        makeInvoice({ id: "nc1", invoiceNumber: "AN262/1565", invoiceDate: new Date("2026-06-09"), status: "pending", totalWithVat: -57.46, documentType: "credit_note" }),
        makeInvoice({ id: "nc2", invoiceNumber: "NCA262/1840", invoiceDate: new Date("2026-06-30"), status: "pending", totalWithVat: -832.55, documentType: "credit_note" }),
      ];
      statsPort.seed(
        { supplierId: s.id, invoiceCount: 5, totalBilled: 933.43, totalPaid: 0, totalPending: 933.43, lastInvoiceDate: new Date("2026-06-08"), lastPaymentDate: null },
        rows,
      );

      const useCase = new GetSupplierStatementUseCase(repo, statsPort, new FakeInvoicePaymentReadAdapter());
      const result = await useCase.execute({
        organizationId: ORG_ID,
        id: s.id,
        informedFinalBalance: 0,
      });

      expect(result.totalInvoiced).toBeCloseTo(933.43, 2);
      expect(result.totalCreditNotes).toBeCloseTo(890.01, 2);
      expect(result.totalMovement).toBeCloseTo(1823.44, 2);
      expect(result.netDocumentBalanceBeforeSettlement).toBeCloseTo(43.42, 2);
      expect(result.finalBalance).toBeCloseTo(0, 2);
      expect(result.isReconciled).toBe(true);
      expect(result.documentCounts).toEqual({ invoices: 5, creditNotes: 2 });

      // 7 documentos + 1 linha de fecho manual
      expect(result.lines).toHaveLength(8);
      const settlement = result.lines[result.lines.length - 1]!;
      expect(settlement.kind).toBe("settlement");
      expect(settlement.date).toBeNull();
      expect(settlement.creditOrSettlementAmount).toBeCloseTo(43.42, 2);
      expect(settlement.runningBalance).toBeCloseTo(0, 2);
    });

    it("sem informedFinalBalance: não há linha de fecho, e o saldo final é o saldo documental real", async () => {
      const repo = new FakeSupplierRepository();
      const statsPort = new FakeSupplierInvoiceStats();
      const s = Supplier.create({ name: "Fornecedor E" });
      await repo.save(ORG_ID, s);

      statsPort.seed(
        { supplierId: s.id, invoiceCount: 1, totalBilled: 100, totalPaid: 0, totalPending: 100, lastInvoiceDate: new Date("2026-06-01"), lastPaymentDate: null },
        [makeInvoice({ id: "i1", invoiceNumber: "F001", invoiceDate: new Date("2026-06-01"), status: "pending", totalWithVat: 100 })],
      );

      const useCase = new GetSupplierStatementUseCase(repo, statsPort, new FakeInvoicePaymentReadAdapter());
      const result = await useCase.execute({ organizationId: ORG_ID, id: s.id });

      expect(result.lines).toHaveLength(1);
      expect(result.lines[0]!.kind).toBe("invoice");
      expect(result.finalBalance).toBe(100);
      expect(result.netDocumentBalanceBeforeSettlement).toBe(100);
      expect(result.isReconciled).toBe(false);
    });

    it("fatura com pagamento real (conciliação bancária) gera uma linha 'payment' com a data/valor do movimento, reduzindo o saldo", async () => {
      const repo = new FakeSupplierRepository();
      const statsPort = new FakeSupplierInvoiceStats();
      const paymentRead = new FakeInvoicePaymentReadAdapter();
      const s = Supplier.create({ name: "Fornecedor F" });
      await repo.save(ORG_ID, s);

      statsPort.seed(
        { supplierId: s.id, invoiceCount: 1, totalBilled: 500, totalPaid: 500, totalPending: 0, lastInvoiceDate: new Date("2026-06-01"), lastPaymentDate: new Date("2026-06-15") },
        [makeInvoice({ id: "i1", invoiceNumber: "F001", invoiceDate: new Date("2026-06-01"), status: "paid", totalWithVat: 500 })],
      );
      paymentRead.seedPayment({ invoiceId: "i1", date: new Date("2026-06-15"), amount: 500 });

      const useCase = new GetSupplierStatementUseCase(repo, statsPort, paymentRead);
      const result = await useCase.execute({ organizationId: ORG_ID, id: s.id });

      expect(result.lines).toHaveLength(2);
      expect(result.lines[0]!.kind).toBe("invoice");
      expect(result.lines[0]!.runningBalance).toBe(500);
      expect(result.lines[1]!.kind).toBe("payment");
      expect(result.lines[1]!.date).toBe("2026-06-15");
      expect(result.lines[1]!.creditOrSettlementAmount).toBe(500);
      expect(result.lines[1]!.runningBalance).toBe(0);
      expect(result.isReconciled).toBe(true);
    });

    it("saldo em aberto real: fatura + nota de crédito parcial + pagamento parcial confirmado por conciliação bancária", async () => {
      const repo = new FakeSupplierRepository();
      const statsPort = new FakeSupplierInvoiceStats();
      const paymentRead = new FakeInvoicePaymentReadAdapter();
      const s = Supplier.create({ name: "Fornecedor I" });
      await repo.save(ORG_ID, s);

      statsPort.seed(
        { supplierId: s.id, invoiceCount: 1, totalBilled: 100, totalPaid: 0, totalPending: 100, lastInvoiceDate: new Date("2026-09-01"), lastPaymentDate: null },
        [
          makeInvoice({ id: "i1", invoiceNumber: "F001", invoiceDate: new Date("2026-09-01"), status: "partial", totalWithVat: 100 }),
          makeInvoice({ id: "nc1", invoiceNumber: "NC001", invoiceDate: new Date("2026-09-03"), status: "pending", totalWithVat: -50, documentType: "credit_note" }),
        ],
      );
      paymentRead.seedPayment({ invoiceId: "i1", date: new Date("2026-09-05"), amount: 30 });

      const useCase = new GetSupplierStatementUseCase(repo, statsPort, paymentRead);
      const result = await useCase.execute({ organizationId: ORG_ID, id: s.id });

      expect(result.lines).toHaveLength(3);
      expect(result.lines.map((l) => l.kind)).toEqual(["invoice", "credit_note", "payment"]);
      expect(result.finalBalance).toBeCloseTo(20, 2);
      expect(result.netDocumentBalanceBeforeSettlement).toBeCloseTo(20, 2);
    });

    it("openingBalance desloca o saldo corrente de todas as linhas", async () => {
      const repo = new FakeSupplierRepository();
      const statsPort = new FakeSupplierInvoiceStats();
      const s = Supplier.create({ name: "Fornecedor G" });
      await repo.save(ORG_ID, s);

      statsPort.seed(
        { supplierId: s.id, invoiceCount: 1, totalBilled: 100, totalPaid: 0, totalPending: 100, lastInvoiceDate: new Date("2026-06-01"), lastPaymentDate: null },
        [makeInvoice({ id: "i1", invoiceNumber: "F001", invoiceDate: new Date("2026-06-01"), status: "pending", totalWithVat: 100 })],
      );

      const useCase = new GetSupplierStatementUseCase(repo, statsPort, new FakeInvoicePaymentReadAdapter());
      const result = await useCase.execute({ organizationId: ORG_ID, id: s.id, openingBalance: 50 });

      expect(result.openingBalance).toBe(50);
      expect(result.lines[0]!.runningBalance).toBe(150);
      expect(result.finalBalance).toBe(150);
    });

    it("informedFinalBalance igual ao saldo documental (dentro da tolerância): não acrescenta linha de fecho", async () => {
      const repo = new FakeSupplierRepository();
      const statsPort = new FakeSupplierInvoiceStats();
      const s = Supplier.create({ name: "Fornecedor H" });
      await repo.save(ORG_ID, s);

      statsPort.seed(
        { supplierId: s.id, invoiceCount: 1, totalBilled: 100, totalPaid: 0, totalPending: 100, lastInvoiceDate: new Date("2026-06-01"), lastPaymentDate: null },
        [makeInvoice({ id: "i1", invoiceNumber: "F001", invoiceDate: new Date("2026-06-01"), status: "pending", totalWithVat: 100 })],
      );

      const useCase = new GetSupplierStatementUseCase(repo, statsPort, new FakeInvoicePaymentReadAdapter());
      const result = await useCase.execute({ organizationId: ORG_ID, id: s.id, informedFinalBalance: 100 });

      expect(result.lines).toHaveLength(1);
      expect(result.isReconciled).toBe(false);
    });
  });
});
