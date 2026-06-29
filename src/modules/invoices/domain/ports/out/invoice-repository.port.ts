import type { Invoice, InvoiceStatus } from "../../entities/invoice.js";

export interface InvoiceFilter {
  supplierId?: string;
  costCenterId?: string;
  status?: InvoiceStatus;
  from?: Date;
  to?: Date;
}

export interface InvoiceRepositoryPort {
  save(invoice: Invoice): Promise<void>;
  findById(id: string): Promise<Invoice | null>;
  findAll(filter?: InvoiceFilter): Promise<Invoice[]>;
  update(invoice: Invoice): Promise<void>;
  delete(id: string): Promise<void>;
  /** Returns an existing (non-cancelled) invoice with the same number and supplier, or null. excludeId skips that invoice (used when updating). */
  findDuplicate(invoiceNumber: string, supplierId: string, excludeId?: string): Promise<Invoice | null>;
  /** Returns an existing (non-cancelled) invoice with the same number and supplier NIF, or null. Used for import/confirm flows where NIF is more reliable than supplierId. */
  findDuplicateByNif(invoiceNumber: string, supplierNif: string, excludeId?: string): Promise<Invoice | null>;
}
