import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { InvoiceAmountsRecord, InvoiceAmountsWritePort } from "../../domain/ports/out/invoice-amounts-write.port.js";

/** Grava os valores do motor único nas colunas de invoices/invoice_lines (migração 20261030150000). */
export class SupabaseInvoiceAmountsWriteAdapter implements InvoiceAmountsWritePort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async save(organizationId: OrganizationId, invoiceId: string, r: InvoiceAmountsRecord): Promise<void> {
    const { error } = await this.scopedQuery(organizationId)
      .table("invoices")
      .update({
        gross_cents: r.grossCents,
        discount_cents: r.discountCents,
        global_discount_kind: r.globalDiscountKind,
        global_discount_value: r.globalDiscountValue,
        footer_discount_cents: r.footerDiscountCents,
        adjustments_cents: r.adjustmentsCents,
        rounding_adjustment_cents: r.roundingAdjustmentCents,
        rounding_adjustment_reason: r.roundingAdjustmentReason,
        vat_summary: r.vatSummary,
        difference_cents: r.differenceCents,
        amounts_validated_at: r.validatedAt?.toISOString() ?? null,
      })
      .eq("id", invoiceId);
    if (error) throw new Error(error.message);
    for (const l of r.lines) {
      const { error: lineError } = await this.scopedQuery(organizationId)
        .table("invoice_lines")
        .update({
          quantity_text: l.quantityText,
          unit_price_text: l.unitPriceText,
          gross_cents: l.grossCents,
          discount_kind: l.discountKind,
          discount_value: l.discountValue,
          discount_cents: l.discountCents,
          global_discount_cents: l.globalDiscountCents,
          net_cents: l.netCents,
        })
        .eq("id", l.lineId)
        .eq("invoice_id", invoiceId);
      if (lineError) throw new Error(lineError.message);
    }
  }
}
