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
}
