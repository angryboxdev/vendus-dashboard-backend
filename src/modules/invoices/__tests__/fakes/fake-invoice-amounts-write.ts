import type { InvoiceAmountsRecord, InvoiceAmountsWritePort } from "../../domain/ports/out/invoice-amounts-write.port.js";

export class FakeInvoiceAmountsWrite implements InvoiceAmountsWritePort {
  saved = new Map<string, InvoiceAmountsRecord>();
  async save(_o: unknown, invoiceId: string, record: InvoiceAmountsRecord): Promise<void> {
    this.saved.set(invoiceId, record);
  }
  async read(_o: unknown, invoiceId: string) {
    const r = this.saved.get(invoiceId);
    if (!r) return null;
    return {
      globalDiscountKind: r.globalDiscountKind,
      globalDiscountValue: r.globalDiscountValue,
      footerDiscountCents: r.footerDiscountCents,
      adjustmentsCents: r.adjustmentsCents,
      roundingAdjustmentCents: r.roundingAdjustmentCents,
      roundingAdjustmentReason: r.roundingAdjustmentReason,
      differenceCents: r.differenceCents,
      lines: r.lines.map((l) => ({ lineId: l.lineId, quantityText: l.quantityText, unitPriceText: l.unitPriceText, discountKind: l.discountKind, discountValue: l.discountValue })),
    };
  }
}
