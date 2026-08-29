import type {
  GetInvoiceAlertsPort,
  InvoiceAlertsDTO,
} from "../../domain/ports/in/invoice.ports.js";
import type { InvoiceRepositoryPort } from "../../domain/ports/out/invoice-repository.port.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";

const VALUE_DISCREPANCY_MARGIN_CENTS = 2;
const LOW_AI_CONFIDENCE_THRESHOLD = 0.7;

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export class GetInvoiceAlertsUseCase implements GetInvoiceAlertsPort {
  constructor(private readonly invoiceRepo: InvoiceRepositoryPort) {}

  async execute(organizationId: OrganizationId): Promise<InvoiceAlertsDTO> {
    const today = startOfDay(new Date());
    const in7Days = new Date(today);
    in7Days.setDate(in7Days.getDate() + 7);

    const all = await this.invoiceRepo.findAll(organizationId);

    // Invoices that still need to be paid
    const unpaid = all.filter(
      (inv) =>
        inv.status !== "paid" &&
        inv.status !== "cancelled" &&
        inv.status !== "draft_ai",
    );

    const overdue = unpaid.filter(
      (inv) => inv.dueDate && startOfDay(inv.dueDate) < today,
    );

    const dueToday = unpaid.filter(
      (inv) => inv.dueDate && isSameDay(inv.dueDate, today),
    );

    const dueIn7Days = unpaid.filter(
      (inv) =>
        inv.dueDate &&
        startOfDay(inv.dueDate) > today &&
        startOfDay(inv.dueDate) <= in7Days,
    );

    const noDueDate = unpaid.filter((inv) => !inv.dueDate);

    const noSupplier = all.filter(
      (inv) =>
        !inv.supplierId &&
        inv.status !== "cancelled" &&
        inv.status !== "draft_ai",
    );

    const pendingReview = all.filter(
      (inv) =>
        inv.status === "draft_ai" ||
        inv.status === "pending_review" ||
        inv.requiresReview,
    );

    const lowAiConfidence = all.filter(
      (inv) =>
        inv.aiConfidence !== null &&
        inv.aiConfidence < LOW_AI_CONFIDENCE_THRESHOLD &&
        inv.status !== "paid" &&
        inv.status !== "cancelled",
    );

    const valueDiscrepancy = all.filter((inv) => {
      if (inv.status === "paid" || inv.status === "cancelled") return false;
      const diff = Math.abs(inv.subtotalWithoutVat + inv.totalVat - inv.totalWithVat);
      return diff > VALUE_DISCREPANCY_MARGIN_CENTS;
    });

    const pendingReconciliation = all.filter(
      (inv) =>
        inv.reconciliationStatus === "pending_reconciliation" ||
        inv.reconciliationStatus === "partially_reconciled",
    );

    const sum = (invoices: typeof all) =>
      invoices.reduce((acc, inv) => acc + inv.totalWithVat, 0);

    return {
      overdue: { count: overdue.length, totalAmount: sum(overdue) },
      dueToday: { count: dueToday.length, totalAmount: sum(dueToday) },
      dueIn7Days: { count: dueIn7Days.length, totalAmount: sum(dueIn7Days) },
      pendingReconciliation: { count: pendingReconciliation.length, totalAmount: sum(pendingReconciliation) },
      noDueDateCount: noDueDate.length,
      noSupplierCount: noSupplier.length,
      pendingReviewCount: pendingReview.length,
      lowAiConfidenceCount: lowAiConfidence.length,
      valueDiscrepancyCount: valueDiscrepancy.length,
    };
  }
}
