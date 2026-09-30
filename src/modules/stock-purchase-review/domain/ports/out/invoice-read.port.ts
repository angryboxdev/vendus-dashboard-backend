import type { OrganizationId } from "../../../../../kernel/organization-id.js";

export interface InvoiceLineSnapshot {
  id: string;
  description: string;
  quantity: number;
  unit: string | null;
  unitCostWithoutVat: number;
  totalWithVat: number;
  costCenterCategoryId: string | null;
  locationId: string | null;
}

export interface InvoiceSnapshot {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  supplierId: string | null;
  supplierName: string;
  supplierNif: string | null;
  status: string;
  stockReviewOverride: "auto" | "force_create" | "force_skip";
  stockReviewOverrideReason: string | null;
  lines: InvoiceLineSnapshot[];
}

/** D10 — wrapper fino sobre `invoices`' `GetInvoicePort`/`ListInvoicesPort`. */
export interface InvoiceReadPort {
  getInvoice(organizationId: OrganizationId, invoiceId: string): Promise<InvoiceSnapshot | null>;
  /** Faturas finalizadas desde `sinceDate` (YYYY-MM-DD) — usado só pela varredura de recuperação. */
  listFinalizedSince(organizationId: OrganizationId, sinceDate: string): Promise<InvoiceSnapshot[]>;
}
