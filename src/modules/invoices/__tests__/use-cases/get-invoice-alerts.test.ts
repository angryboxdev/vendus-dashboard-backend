import { GetInvoiceAlertsUseCase } from "../../application/use-cases/get-invoice-alerts.use-case.js";
import { Invoice } from "../../domain/entities/invoice.js";
import { FakeInvoiceRepository } from "../fakes/fake-invoice-repository.js";

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function daysFromNow(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

function makeInvoice(overrides: Partial<Parameters<typeof Invoice.create>[0]> = {}): Invoice {
  return Invoice.create({
    supplierName: "Fornecedor Teste",
    invoiceNumber: `INV-${Math.random()}`,
    invoiceDate: new Date(),
    subtotalWithoutVat: 100000,
    totalVat: 23000,
    totalWithVat: 123000,
    ...overrides,
  });
}

describe("GetInvoiceAlertsUseCase", () => {
  let repo: FakeInvoiceRepository;
  let useCase: GetInvoiceAlertsUseCase;

  beforeEach(() => {
    repo = new FakeInvoiceRepository();
    useCase = new GetInvoiceAlertsUseCase(repo);
  });

  it("returns zeros when there are no invoices", async () => {
    const alerts = await useCase.execute();
    expect(alerts.overdue.count).toBe(0);
    expect(alerts.dueToday.count).toBe(0);
    expect(alerts.dueIn7Days.count).toBe(0);
    expect(alerts.noDueDateCount).toBe(0);
    expect(alerts.noSupplierCount).toBe(0);
    expect(alerts.pendingReviewCount).toBe(0);
  });

  it("counts overdue invoices", async () => {
    const overdueInvoice = makeInvoice({ dueDate: daysAgo(5) });
    await repo.save(overdueInvoice);
    await repo.save(makeInvoice({ dueDate: daysFromNow(10) }));

    const alerts = await useCase.execute();
    expect(alerts.overdue.count).toBe(1);
    expect(alerts.overdue.totalAmount).toBe(123000);
  });

  it("counts invoices with no due date", async () => {
    await repo.save(makeInvoice({ dueDate: null }));
    await repo.save(makeInvoice({ dueDate: null }));
    await repo.save(makeInvoice({ dueDate: daysFromNow(5) }));

    const alerts = await useCase.execute();
    expect(alerts.noDueDateCount).toBe(2);
  });

  it("counts invoices with no supplier", async () => {
    await repo.save(makeInvoice({ supplierId: null, dueDate: daysFromNow(5) }));
    await repo.save(makeInvoice({ supplierId: "sup-1", dueDate: daysFromNow(5) }));

    const alerts = await useCase.execute();
    expect(alerts.noSupplierCount).toBe(1);
  });

  it("counts draft_ai and requiresReview invoices in pendingReviewCount", async () => {
    const draft = Invoice.createFromImport({
      supplierName: "X",
      invoiceNumber: "A",
      invoiceDate: new Date(),
      subtotalWithoutVat: 100,
      totalVat: 23,
      totalWithVat: 123,
      source: "pdf_import",
      aiConfidence: 0.5,
      requiresReview: true,
    });
    await repo.save(draft);
    await repo.save(makeInvoice());

    const alerts = await useCase.execute();
    expect(alerts.pendingReviewCount).toBe(1);
  });

  it("excludes paid and cancelled invoices from overdue and noSupplier counts", async () => {
    const paidInvoice = makeInvoice({ dueDate: daysAgo(5) }).markPaid(new Date());
    const cancelledInvoice = makeInvoice({ dueDate: daysAgo(5) }).cancel();
    await repo.save(paidInvoice);
    await repo.save(cancelledInvoice);

    const alerts = await useCase.execute();
    expect(alerts.overdue.count).toBe(0);
  });

  it("detects value discrepancy", async () => {
    const invoice = Invoice.create({
      supplierName: "X",
      invoiceNumber: "A",
      invoiceDate: new Date(),
      subtotalWithoutVat: 100000,
      totalVat: 23000,
      totalWithVat: 124000, // diverge por 1000 cêntimos (>2)
    });
    await repo.save(invoice);

    const alerts = await useCase.execute();
    expect(alerts.valueDiscrepancyCount).toBe(1);
  });
});
