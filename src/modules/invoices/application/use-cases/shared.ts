import type { Invoice } from "../../domain/entities/invoice.js";
import type { InvoiceLine } from "../../domain/entities/invoice-line.js";
import type { InvoiceDTO, InvoiceLineDTO } from "../../domain/ports/in/invoice.ports.js";

function formatDate(date: Date | null): string | null {
  if (!date) return null;
  return date.toISOString().slice(0, 10);
}

export function toInvoiceDTO(invoice: Invoice, lines?: InvoiceLine[]): InvoiceDTO {
  const dto: InvoiceDTO = {
    id: invoice.id,
    supplierId: invoice.supplierId,
    supplierName: invoice.supplierName,
    supplierNifSnapshot: invoice.supplierNifSnapshot,
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: formatDate(invoice.invoiceDate) as string,
    dueDate: formatDate(invoice.dueDate),
    paidAt: formatDate(invoice.paidAt),
    isDirectDebit: invoice.isDirectDebit,
    directDebitDate: formatDate(invoice.directDebitDate),
    subtotalWithoutVat: invoice.subtotalWithoutVat,
    totalVat: invoice.totalVat,
    totalWithVat: invoice.totalWithVat,
    status: invoice.status,
    notes: invoice.notes,
    attachmentUrl: invoice.attachmentUrl,
    source: invoice.source,
    aiExtractionStatus: invoice.aiExtractionStatus,
    aiConfidence: invoice.aiConfidence,
    requiresReview: invoice.requiresReview,
    costCenterGroupId: invoice.costCenterGroupId,
    costCenterCategoryId: invoice.costCenterCategoryId,
    financialType: invoice.financialType,
    affectsDre: invoice.affectsDre,
    affectsCashflow: invoice.affectsCashflow,
    affectsProfitability: invoice.affectsProfitability,
    currency: invoice.currency,
    createdAt: invoice.createdAt.toISOString(),
    updatedAt: invoice.updatedAt.toISOString(),
  };
  if (lines !== undefined) {
    dto.lines = lines.map(toInvoiceLineDTO);
  }
  return dto;
}

export function toInvoiceLineDTO(line: InvoiceLine): InvoiceLineDTO {
  return {
    id: line.id,
    invoiceId: line.invoiceId,
    description: line.description,
    type: line.type,
    costCenterCategoryId: line.costCenterCategoryId,
    stockItemId: line.stockItemId,
    quantity: line.quantity,
    unit: line.unit,
    unitCostWithoutVat: line.unitCostWithoutVat,
    vatRate: line.vatRate,
    vatAmount: line.vatAmount,
    totalWithVat: line.totalWithVat,
    stockEntryId: line.stockEntryId,
    affectsDre: line.affectsDre,
    affectsCashflow: line.affectsCashflow,
    affectsProfitability: line.affectsProfitability,
    createdAt: line.createdAt.toISOString(),
  };
}
