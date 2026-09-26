import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { InvoicePayment, InvoicePaymentReadPort } from "../../domain/ports/out/invoice-payment-read.port.js";

interface LinkRow {
  entity_id: string;
  allocated_amount_cents: number;
  bank_movements: { booking_date: string } | null;
}

/**
 * Cross-module: lê `bank_movement_entity_links` (entity_type='invoice')
 * fazendo join a `bank_movements` só para obter a data do movimento — sem
 * importar código de `bank-statements` (D10).
 */
export class SupabaseInvoicePaymentReadAdapter implements InvoicePaymentReadPort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async findByInvoiceIds(organizationId: OrganizationId, invoiceIds: string[]): Promise<InvoicePayment[]> {
    if (invoiceIds.length === 0) return [];

    const { data, error } = await this.scopedQuery(organizationId)
      .table("bank_movement_entity_links")
      .select("entity_id, allocated_amount_cents, bank_movements!bank_movement_entity_links_movement_id_fkey(booking_date)")
      .eq("entity_type", "invoice")
      .in("entity_id", invoiceIds);
    if (error) throw new Error(error.message);

    return ((data ?? []) as unknown as LinkRow[])
      .filter((row) => row.bank_movements != null)
      .map((row) => ({
        invoiceId: row.entity_id,
        date: new Date(row.bank_movements!.booking_date),
        amount: row.allocated_amount_cents / 100,
      }));
  }
}
