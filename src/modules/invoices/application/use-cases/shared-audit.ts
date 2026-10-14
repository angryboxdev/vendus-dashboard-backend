import type { Invoice } from "../../domain/entities/invoice.js";

/** Campos de valor/identidade que entram no antes/depois da auditoria (sem dados pessoais além do fornecedor). */
export function auditSnapshot(i: Invoice): Record<string, unknown> {
  return {
    status: i.status,
    documentType: i.documentType,
    supplierId: i.supplierId,
    supplierName: i.supplierName,
    supplierNif: i.supplierNifSnapshot,
    invoiceNumber: i.invoiceNumber,
    invoiceDate: i.invoiceDate.toISOString().slice(0, 10),
    dueDate: i.dueDate?.toISOString().slice(0, 10) ?? null,
    subtotalWithoutVat: i.subtotalWithoutVat,
    totalVat: i.totalVat,
    totalWithVat: i.totalWithVat,
    stockReviewOverride: i.stockReviewOverride,
    version: i.version,
  };
}
