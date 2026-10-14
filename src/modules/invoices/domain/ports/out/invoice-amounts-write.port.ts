import type { OrganizationId } from "../../../../../kernel/organization-id.js";

/** Valores normalizados de uma linha (motor único) e os textos originais extraídos. */
export interface LineAmountsRecord {
  lineId: string;
  quantityText: string | null;
  unitPriceText: string | null;
  grossCents: number;
  discountKind: "pct" | "amount" | null;
  discountValue: number | null;
  discountCents: number;
  globalDiscountCents: number;
  netCents: number;
}

/** Valores do documento: bruto, descontos, quadro de IVA por taxa e diferença para a fatura. */
export interface InvoiceAmountsRecord {
  grossCents: number | null;
  discountCents: number | null;
  globalDiscountKind: "pct" | "amount" | null;
  globalDiscountValue: number | null;
  footerDiscountCents: number | null;
  adjustmentsCents: number;
  roundingAdjustmentCents: number;
  roundingAdjustmentReason: string | null;
  vatSummary: { rate: string; baseCents: number; vatCents: number }[] | null;
  differenceCents: number | null;
  /** Preenchido só quando reconciliado ao cêntimo e finalizado. */
  validatedAt: Date | null;
  lines: LineAmountsRecord[];
}

/**
 * Output port: grava as colunas de valores (task v1.2 §1.3) — separado do
 * repositório da fatura para não mexer no mapeamento legado das entidades.
 */
export interface InvoiceAmountsWritePort {
  save(organizationId: OrganizationId, invoiceId: string, record: InvoiceAmountsRecord): Promise<void>;
  /** Valores gravados (descontos, textos originais, ajustes) — para reabrir um rascunho sem perder nada. */
  read(organizationId: OrganizationId, invoiceId: string): Promise<StoredAmountsView | null>;
}

export interface StoredAmountsView {
  globalDiscountKind: "pct" | "amount" | null;
  globalDiscountValue: number | null;
  footerDiscountCents: number | null;
  adjustmentsCents: number;
  roundingAdjustmentCents: number;
  roundingAdjustmentReason: string | null;
  differenceCents: number | null;
  lines: { lineId: string; quantityText: string | null; unitPriceText: string | null; discountKind: "pct" | "amount" | null; discountValue: number | null }[];
}
