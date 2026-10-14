import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { InvoiceAllocation } from "../../entities/invoice-allocation.js";

export interface InvoiceAllocationRepositoryPort {
  findByInvoiceId(organizationId: OrganizationId, invoiceId: string): Promise<InvoiceAllocation[]>;
  /** Todas as alocações da organização (feed de análise por CC e classificação na listagem). */
  findAll(organizationId: OrganizationId): Promise<InvoiceAllocation[]>;
  /** Substitui as alocações da fatura (as anteriores são removidas). */
  replaceForInvoice(organizationId: OrganizationId, invoiceId: string, allocations: InvoiceAllocation[]): Promise<void>;
}
