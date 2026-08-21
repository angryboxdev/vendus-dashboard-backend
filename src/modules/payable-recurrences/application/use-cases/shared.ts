import type { Recurrence } from "../../domain/entities/recurrence.js";
import type { RecurrenceOccurrence } from "../../domain/entities/recurrence-occurrence.js";
import type { RecurrenceDTO } from "../../domain/ports/in/recurrence.ports.js";
import type { OccurrenceDTO } from "../../domain/ports/in/occurrence.ports.js";

/** Serializes a Date to YYYY-MM-DD using local time (avoids UTC offset shifting the day). */
function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function toRecurrenceDTO(r: Recurrence): RecurrenceDTO {
  return {
    id: r.id,
    name: r.name,
    supplierId: r.supplierId,
    supplierName: r.supplierName,
    type: r.type,
    frequency: r.frequency,
    costCenterId: r.costCenterId,
    costCenterCategoryId: r.costCenterCategoryId,
    category: r.category,
    estimatedAmountCents: r.estimatedAmountCents,
    dayOfMonth: r.dayOfMonth,
    startDate: toLocalDateString(r.startDate),
    endDate: r.endDate ? toLocalDateString(r.endDate) : null,
    paymentMethod: r.paymentMethod,
    autoCreatePayable: r.autoCreatePayable,
    requireInvoice: r.requireInvoice,
    status: r.status,
    notes: r.notes,
    documentUrl: r.documentUrl,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export function toOccurrenceDTO(o: RecurrenceOccurrence): OccurrenceDTO {
  return {
    id: o.id,
    recurrenceId: o.recurrenceId,
    period: o.period,
    estimatedAmountCents: o.estimatedAmountCents,
    realAmountCents: o.realAmountCents,
    effectiveAmountCents: o.effectiveAmountCents,
    dueDate: toLocalDateString(o.dueDate),
    status: o.status,
    requireInvoice: o.requireInvoice,
    invoiceId: o.invoiceId,
    paidAt: o.paidAt ? o.paidAt.toISOString() : null,
    paymentMethod: o.paymentMethod,
    paymentBankAccountId: o.paymentBankAccountId,
    paymentNotes: o.paymentNotes,
    notes: o.notes,
    documentUrl: o.documentUrl,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  };
}
