import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type {
  InvoiceDTO,
  InvoiceLineDTO,
  ListInvoicesFilter,
  ListInvoicesPort,
  ListInvoiceLinesPort,
} from "../../../invoices/domain/ports/in/invoice.ports.js";

/** Stub mínimo — só os campos que `GetVatOverviewUseCase`/`ListAccountingDocumentsUseCase` de facto leem. Ficheiros de teste não passam por `tsc` neste projeto (ver tsconfig), por isso o cast é seguro aqui. */
export function invoiceStub(overrides: Partial<InvoiceDTO>): InvoiceDTO {
  return {
    id: "inv-1",
    supplierId: null,
    supplierName: "Fornecedor Teste",
    invoiceNumber: "FT 1",
    invoiceDate: "2026-07-15",
    dueDate: null,
    status: "pending",
    documentType: "invoice",
    totalWithVat: 0,
    costCenterCategoryId: null,
    ...overrides,
  } as unknown as InvoiceDTO;
}

export function invoiceLineStub(overrides: Partial<InvoiceLineDTO>): InvoiceLineDTO {
  return {
    id: "line-1",
    invoiceId: "inv-1",
    costCenterCategoryId: null,
    vatRate: 23,
    vatAmount: 0,
    ...overrides,
  } as unknown as InvoiceLineDTO;
}

export class FakeListInvoices implements ListInvoicesPort {
  rows: InvoiceDTO[] = [];

  async execute(_organizationId: OrganizationId, filter?: ListInvoicesFilter): Promise<InvoiceDTO[]> {
    return this.rows.filter((inv) => {
      if (filter?.from && inv.invoiceDate < filter.from) return false;
      if (filter?.to && inv.invoiceDate > filter.to) return false;
      return true;
    });
  }
}

export class FakeListInvoiceLines implements ListInvoiceLinesPort {
  rows: InvoiceLineDTO[] = [];

  async execute(_organizationId: OrganizationId): Promise<InvoiceLineDTO[]> {
    return this.rows;
  }
}
