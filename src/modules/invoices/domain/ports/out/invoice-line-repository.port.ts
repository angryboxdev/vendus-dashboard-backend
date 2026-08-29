import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { InvoiceLine } from "../../entities/invoice-line.js";

export interface InvoiceLineRepositoryPort {
  saveAll(organizationId: OrganizationId, lines: InvoiceLine[]): Promise<void>;
  findAll(organizationId: OrganizationId): Promise<InvoiceLine[]>;
  findByInvoiceId(organizationId: OrganizationId, invoiceId: string): Promise<InvoiceLine[]>;
  updateLine(organizationId: OrganizationId, line: InvoiceLine): Promise<void>;
  deleteByInvoiceId(organizationId: OrganizationId, invoiceId: string): Promise<void>;
  deleteLineById(organizationId: OrganizationId, lineId: string): Promise<void>;
  updateCostCenterCategoryForInvoice(
    organizationId: OrganizationId,
    invoiceId: string,
    categoryId: string | null,
  ): Promise<void>;
}
