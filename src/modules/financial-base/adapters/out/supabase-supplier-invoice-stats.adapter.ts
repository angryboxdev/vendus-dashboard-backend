import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type {
  SupplierInvoiceFilter,
  SupplierInvoiceRow,
  SupplierInvoiceStats,
  SupplierInvoiceStatsPort,
} from "../../domain/ports/out/supplier-invoice-stats.port.js";

// Os valores monetários são guardados em cêntimos na tabela invoices (alinhado com InvoicesView).
const fromCents = (n: number): number => n / 100;

// Statuses que não entram no totalBilled nem invoiceCount (não são faturas confirmadas)
const EXCLUDED_FROM_BILLED = new Set(["cancelled", "draft_ai", "pending_review"]);
// Statuses que representam valores em aberto (a pagar)
const PENDING_STATUSES = new Set(["pending", "overdue", "partial"]);

/**
 * Nunca guarda um `SupabaseClient` — recebe o factory `createScopedQuery`
 * (`ScopedQueryFactory`) injectado pelo composition root e constrói um
 * `ScopedQuery` por chamada (D2).
 */
export class SupabaseSupplierInvoiceStatsAdapter implements SupplierInvoiceStatsPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async getSummariesForSuppliers(
    organizationId: OrganizationId,
    supplierIds: string[],
  ): Promise<SupplierInvoiceStats[]> {
    if (supplierIds.length === 0) return [];

    const { data, error } = await this.scopedQuery(organizationId)
      .table("invoices")
      .select("supplier_id, total_with_vat, status, invoice_date, paid_at")
      .in("supplier_id", supplierIds);

    if (error) throw new Error(error.message);

    // Inicializa mapa com stats zeradas para todos os IDs pedidos
    const statsMap = new Map<string, SupplierInvoiceStats>(
      supplierIds.map((id) => [
        id,
        {
          supplierId: id,
          invoiceCount: 0,
          totalBilled: 0,
          totalPaid: 0,
          totalPending: 0,
          lastInvoiceDate: null,
          lastPaymentDate: null,
        },
      ]),
    );

    for (const row of (data ?? []) as unknown as Array<{
      supplier_id: string;
      total_with_vat: number;
      status: string;
      invoice_date: string;
      paid_at: string | null;
    }>) {
      const stats = statsMap.get(row.supplier_id);
      if (!stats) continue;

      if (!EXCLUDED_FROM_BILLED.has(row.status)) {
        stats.invoiceCount++;
        stats.totalBilled += fromCents(row.total_with_vat);
        const invoiceDate = new Date(row.invoice_date);
        if (!stats.lastInvoiceDate || invoiceDate > stats.lastInvoiceDate) {
          stats.lastInvoiceDate = invoiceDate;
        }
      }

      if (row.status === "paid") {
        stats.totalPaid += fromCents(row.total_with_vat);
        if (row.paid_at) {
          const paidAt = new Date(row.paid_at);
          if (!stats.lastPaymentDate || paidAt > stats.lastPaymentDate) {
            stats.lastPaymentDate = paidAt;
          }
        }
      }

      if (PENDING_STATUSES.has(row.status)) {
        stats.totalPending += fromCents(row.total_with_vat);
      }
    }

    return Array.from(statsMap.values());
  }

  async listInvoicesBySupplier(
    organizationId: OrganizationId,
    supplierId: string,
    filter?: SupplierInvoiceFilter,
  ): Promise<SupplierInvoiceRow[]> {
    let query = this.scopedQuery(organizationId)
      .table("invoices")
      .select(
        "id, invoice_number, invoice_date, due_date, subtotal_without_vat, total_vat, total_with_vat, status, paid_at, attachment_url",
      )
      .eq("supplier_id", supplierId)
      .neq("status", "draft_ai")
      .neq("status", "pending_review");

    if (filter?.startDate) {
      query = query.gte("invoice_date", filter.startDate.toISOString().slice(0, 10));
    }
    if (filter?.endDate) {
      query = query.lte("invoice_date", filter.endDate.toISOString().slice(0, 10));
    }

    query = query.order("invoice_date", { ascending: false });

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
      id: row.id as string,
      invoiceNumber: row.invoice_number as string,
      invoiceDate: new Date(row.invoice_date as string),
      dueDate: row.due_date ? new Date(row.due_date as string) : null,
      totalWithoutVat: fromCents(row.subtotal_without_vat as number),
      vatAmount: fromCents(row.total_vat as number),
      totalWithVat: fromCents(row.total_with_vat as number),
      status: row.status as string,
      paidAt: row.paid_at ? new Date(row.paid_at as string) : null,
      attachmentUrl: (row.attachment_url as string | null) ?? null,
    }));
  }
}
