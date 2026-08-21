import type { FinancialObligation } from "../../domain/entities/financial-obligation.js";
import type { FinancialObligationDTO } from "../../domain/ports/in/obligation.ports.js";

export function toDTO(o: FinancialObligation): FinancialObligationDTO {
  return {
    id: o.id,
    source: o.source,
    supplierId: o.supplierId,
    supplierName: o.supplierName,
    description: o.description,
    amountCents: o.amountCents,
    dueDate: o.dueDate.toISOString().slice(0, 10),
    paidAt: o.paidAt ? o.paidAt.toISOString().slice(0, 10) : null,
    paymentMethod: o.paymentMethod,
    status: o.status,
    invoiceId: o.invoiceId,
    recurrenceId: o.recurrenceId,
    recurrenceName: o.recurrenceName,
    documentUrl: o.documentUrl,
    costCenterId: o.costCenterId,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  };
}
