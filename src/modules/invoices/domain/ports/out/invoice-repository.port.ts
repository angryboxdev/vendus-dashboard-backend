import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { Invoice, InvoiceStatus, ReconciliationStatus } from "../../entities/invoice.js";

export interface InvoiceFilter {
  supplierId?: string;
  costCenterId?: string;
  status?: InvoiceStatus;
  reconciliationStatus?: ReconciliationStatus;
  from?: Date;
  to?: Date;
  isDirectDebit?: boolean;
  search?: string; // matches supplier_name or invoice_number (case-insensitive)
}

export interface InvoiceRepositoryPort {
  save(organizationId: OrganizationId, invoice: Invoice): Promise<void>;
  findById(organizationId: OrganizationId, id: string): Promise<Invoice | null>;
  findAll(organizationId: OrganizationId, filter?: InvoiceFilter): Promise<Invoice[]>;
  update(organizationId: OrganizationId, invoice: Invoice): Promise<void>;
  delete(organizationId: OrganizationId, id: string): Promise<void>;
  /** Returns an existing (non-cancelled) invoice with the same number and supplier, or null. excludeId skips that invoice (used when updating). */
  findDuplicate(
    organizationId: OrganizationId,
    invoiceNumber: string,
    supplierId: string,
    excludeId?: string,
  ): Promise<Invoice | null>;
  /** Returns an existing (non-cancelled) invoice with the same number and supplier NIF, or null. Used for import/confirm flows where NIF is more reliable than supplierId. */
  findDuplicateByNif(
    organizationId: OrganizationId,
    invoiceNumber: string,
    supplierNif: string,
    excludeId?: string,
  ): Promise<Invoice | null>;
  /** Returns invoices that are direct debit, have directDebitDate ≤ today, and are not yet paid or cancelled. */
  findPendingDirectDebits(organizationId: OrganizationId): Promise<Invoice[]>;
}
