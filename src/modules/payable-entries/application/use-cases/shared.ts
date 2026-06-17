import type { PayableEntry } from "../../domain/entities/payable-entry.js";
import type { PayableEntryDTO } from "../../domain/ports/in/payable-entry.ports.js";

export function toDTO(entry: PayableEntry): PayableEntryDTO {
  return {
    id: entry.id,
    invoiceId: entry.invoiceId,
    supplierId: entry.supplierId,
    supplierName: entry.supplierName,
    description: entry.description,
    costCenterId: entry.costCenterId,
    category: entry.category,
    amount: entry.amount,
    dueDate: entry.dueDate.toISOString().slice(0, 10),
    paidAt: entry.paidAt ? entry.paidAt.toISOString().slice(0, 10) : null,
    recurrence: entry.recurrence,
    status: entry.status,
    notes: entry.notes,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}
