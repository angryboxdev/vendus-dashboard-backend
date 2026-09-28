import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { GetVatOverviewUseCase } from "../../application/use-cases/get-vat-overview.use-case.js";
import { AccountingDocument } from "../../domain/entities/accounting-document.js";
import { FakeSalesVatRead } from "../fakes/fake-sales-vat-read.js";
import { FakeListInvoices, FakeListInvoiceLines, invoiceStub, invoiceLineStub } from "../fakes/fake-invoices-read.js";
import { FakeListCostCenterCategories, categoryStub } from "../fakes/fake-list-cost-center-categories.js";
import { FakeAccountingDocumentRepository } from "../fakes/fake-accounting-document-repository.js";
import { FakeAccountingSettingsRepository } from "../fakes/fake-accounting-settings-repository.js";

const ORG = mintOrganizationId("org-test");

function makeUseCase() {
  const salesVatRead = new FakeSalesVatRead();
  const listInvoices = new FakeListInvoices();
  const listInvoiceLines = new FakeListInvoiceLines();
  const listCostCenterCategories = new FakeListCostCenterCategories();
  const documentRepository = new FakeAccountingDocumentRepository();
  const settingsRepository = new FakeAccountingSettingsRepository();
  const useCase = new GetVatOverviewUseCase(
    salesVatRead,
    listInvoices,
    listInvoiceLines,
    listCostCenterCategories,
    documentRepository,
    settingsRepository,
  );
  return { salesVatRead, listInvoices, listInvoiceLines, listCostCenterCategories, documentRepository, settingsRepository, useCase };
}

function makeDocument(overrides: Partial<Parameters<typeof AccountingDocument.create>[0]> = {}) {
  return AccountingDocument.create({
    organizationId: ORG,
    documentType: "partner_invoice",
    fundingSource: "partner",
    entityName: "Sócio A",
    issueDate: "2026-07-20",
    subtotalWithoutVat: 1000,
    vatAmount: 130,
    totalWithVat: 1130,
    vatDeductibleAmount: 0,
    vatNonDeductibleAmount: 130,
    settlementMethod: "reimbursement",
    createdBy: "user@fonsat.pt",
    ...overrides,
  });
}

describe("GetVatOverviewUseCase", () => {
  it("separa IVA dedutível de não-dedutível a partir de cost_center_categories.vat_deductible, nunca de uma regra fiscal própria", async () => {
    const { salesVatRead, listInvoices, listInvoiceLines, listCostCenterCategories, useCase } = makeUseCase();

    salesVatRead.rows = [{ rate: 23, grossRevenue: 100000, vatAmount: 23000, netRevenue: 77000 }];

    listCostCenterCategories.rows = [
      categoryStub({ id: "cat-deductible", vatDeductible: true }),
      categoryStub({ id: "cat-non-deductible", vatDeductible: false }),
    ];

    listInvoices.rows = [
      invoiceStub({ id: "inv-1", invoiceDate: "2026-07-05", documentType: "invoice", status: "pending" }),
      invoiceStub({ id: "inv-2", invoiceDate: "2026-08-10", documentType: "invoice", status: "pending" }),
    ];
    listInvoiceLines.rows = [
      invoiceLineStub({ invoiceId: "inv-1", vatRate: 23, vatAmount: 1000, costCenterCategoryId: "cat-deductible" }),
      invoiceLineStub({ invoiceId: "inv-2", vatRate: 23, vatAmount: 500, costCenterCategoryId: "cat-non-deductible" }),
    ];

    const result = await useCase.execute({ organizationId: ORG, year: 2026, period: 3 });

    expect(result.salesVatTotal).toBe(23000);
    expect(result.purchasesVatDeductibleTotal).toBe(1000);
    expect(result.purchasesVatNonDeductibleTotal).toBe(500);
    expect(result.balance).toBe(23000 - 1000);
  });

  it("um override explícito por linha tem prioridade sobre a sugestão da categoria", async () => {
    const { listInvoices, listInvoiceLines, listCostCenterCategories, useCase } = makeUseCase();
    listCostCenterCategories.rows = [categoryStub({ id: "cat-1", vatDeductible: false })];
    listInvoices.rows = [invoiceStub({ id: "inv-1", invoiceDate: "2026-07-05", documentType: "invoice", status: "pending" })];
    listInvoiceLines.rows = [
      invoiceLineStub({
        invoiceId: "inv-1",
        vatRate: 23,
        vatAmount: 1000,
        costCenterCategoryId: "cat-1",
        deductiblePercentage: 100,
        deductibilityOverrideReason: "Uso profissional confirmado",
      }),
    ];

    const result = await useCase.execute({ organizationId: ORG, year: 2026, period: 3 });

    expect(result.purchasesVatDeductibleTotal).toBe(1000);
    expect(result.purchasesVatNonDeductibleTotal).toBe(0);
  });

  it("uma nota de crédito subtrai do IVA de compras em vez de somar", async () => {
    const { listInvoices, listInvoiceLines, listCostCenterCategories, useCase } = makeUseCase();
    listCostCenterCategories.rows = [categoryStub({ id: "cat-1", vatDeductible: true })];
    listInvoices.rows = [
      invoiceStub({ id: "inv-1", invoiceDate: "2026-07-05", documentType: "invoice", status: "pending" }),
      invoiceStub({ id: "inv-2", invoiceDate: "2026-07-06", documentType: "credit_note", status: "pending" }),
    ];
    listInvoiceLines.rows = [
      invoiceLineStub({ invoiceId: "inv-1", vatRate: 23, vatAmount: 1000, costCenterCategoryId: "cat-1" }),
      invoiceLineStub({ invoiceId: "inv-2", vatRate: 23, vatAmount: 300, costCenterCategoryId: "cat-1" }),
    ];

    const result = await useCase.execute({ organizationId: ORG, year: 2026, period: 3 });

    expect(result.purchasesVatDeductibleTotal).toBe(1000 - 300);
  });

  it("uma linha sem classificação conta como dedutível por omissão, mas nunca desaparece do saldo", async () => {
    const { listInvoices, listInvoiceLines, useCase } = makeUseCase();
    listInvoices.rows = [invoiceStub({ id: "inv-1", invoiceDate: "2026-07-05", documentType: "invoice", status: "pending" })];
    listInvoiceLines.rows = [invoiceLineStub({ invoiceId: "inv-1", vatRate: 23, vatAmount: 400, costCenterCategoryId: null })];

    const result = await useCase.execute({ organizationId: ORG, year: 2026, period: 3 });

    expect(result.purchasesVatDeductibleTotal).toBe(400);
    expect(result.purchasesVatNonDeductibleTotal).toBe(0);
  });

  it("uma fatura cancelada nunca entra no cálculo", async () => {
    const { listInvoices, listInvoiceLines, useCase } = makeUseCase();
    listInvoices.rows = [invoiceStub({ id: "inv-1", invoiceDate: "2026-07-05", documentType: "invoice", status: "cancelled" })];
    listInvoiceLines.rows = [invoiceLineStub({ invoiceId: "inv-1", vatRate: 23, vatAmount: 999 })];

    const result = await useCase.execute({ organizationId: ORG, year: 2026, period: 3 });

    expect(result.purchasesVatDeductibleTotal).toBe(0);
  });

  it("um AccountingDocument entra nos totais gerais e no drill-down, mas nunca no breakdown por taxa", async () => {
    const { documentRepository, useCase } = makeUseCase();
    documentRepository.seed(
      makeDocument({ vatAmount: 130, vatDeductibleAmount: 0, vatNonDeductibleAmount: 130 }),
    );

    const result = await useCase.execute({ organizationId: ORG, year: 2026, period: 3 });

    expect(result.purchasesVatNonDeductibleTotal).toBe(130);
    expect(result.byRate).toEqual([]);
    expect(result.documents).toHaveLength(1);
  });

  it("um AccountingDocument cancelado nunca entra no cálculo", async () => {
    const { documentRepository, useCase } = makeUseCase();
    documentRepository.seed(makeDocument({ vatAmount: 130, vatDeductibleAmount: 130 }).cancel("Erro", "user@fonsat.pt"));

    const result = await useCase.execute({ organizationId: ORG, year: 2026, period: 3 });

    expect(result.documents).toHaveLength(0);
    expect(result.purchasesVatDeductibleTotal).toBe(0);
  });

  it("usa a periodicidade configurada da organização (mensal), nunca hardcoded", async () => {
    const { listInvoices, settingsRepository, useCase } = makeUseCase();
    await settingsRepository.save(ORG, { vatPeriodicity: "monthly" });
    let capturedFilter: unknown;
    listInvoices.execute = async (_org, filter) => {
      capturedFilter = filter;
      return [];
    };

    await useCase.execute({ organizationId: ORG, year: 2026, period: 7 });

    expect(capturedFilter).toEqual({ from: "2026-07-01", to: "2026-07-31" });
  });

  it("por omissão (sem configuração gravada) usa trimestre", async () => {
    const { listInvoices, useCase } = makeUseCase();
    let capturedFilter: unknown;
    listInvoices.execute = async (_org, filter) => {
      capturedFilter = filter;
      return [];
    };

    await useCase.execute({ organizationId: ORG, year: 2026, period: 1 });

    expect(capturedFilter).toEqual({ from: "2026-01-01", to: "2026-03-31" });
  });
});
