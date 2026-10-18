import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { InvoiceAmountsRecord, InvoiceAmountsWritePort, StoredAmountsView } from "../../domain/ports/out/invoice-amounts-write.port.js";

/** Grava os valores do motor único nas colunas de invoices/invoice_lines (migração 20261030150000). */
export class SupabaseInvoiceAmountsWriteAdapter implements InvoiceAmountsWritePort {
  constructor(private readonly scopedQuery: ScopedQueryFactory) {}

  async read(organizationId: OrganizationId, invoiceId: string): Promise<StoredAmountsView | null> {
    const head = await this.scopedQuery(organizationId)
      .table("invoices")
      .select("global_discount_kind, global_discount_value, footer_discount_cents, adjustments_cents, rounding_adjustment_cents, rounding_adjustment_reason, difference_cents")
      .eq("id", invoiceId)
      .maybeSingle();
    if (head.error) throw new Error(head.error.message);
    if (!head.data) return null;
    const lines = await this.scopedQuery(organizationId).table("invoice_lines").select("id, quantity_text, unit_price_text, discount_kind, discount_value").eq("invoice_id", invoiceId);
    if (lines.error) throw new Error(lines.error.message);
    const h = head.data as unknown as Record<string, unknown>;
    const num = (v: unknown) => (v == null ? null : Number(v));
    return {
      globalDiscountKind: (h.global_discount_kind as "pct" | "amount" | null) ?? null,
      globalDiscountValue: num(h.global_discount_value),
      footerDiscountCents: num(h.footer_discount_cents),
      adjustmentsCents: Number(h.adjustments_cents ?? 0),
      roundingAdjustmentCents: Number(h.rounding_adjustment_cents ?? 0),
      roundingAdjustmentReason: (h.rounding_adjustment_reason as string | null) ?? null,
      differenceCents: num(h.difference_cents),
      lines: ((lines.data ?? []) as unknown as Record<string, unknown>[]).map((l) => ({
        lineId: l.id as string,
        quantityText: (l.quantity_text as string | null) ?? null,
        unitPriceText: (l.unit_price_text as string | null) ?? null,
        discountKind: (l.discount_kind as "pct" | "amount" | null) ?? null,
        discountValue: num(l.discount_value),
      })),
    };
  }

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
