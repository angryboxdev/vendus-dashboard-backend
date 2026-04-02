/** Movimentos criados pela confirmação de import de fatura. */
export const SUPPLIER_INVOICE_IMPORT_CREATED_BY = "supplier-invoice-import";

export function invoiceImportMovementReference(importId: string): string {
  return `invoice-import:${importId}`;
}

export type SupplierInvoiceImportStatus =
  | "uploaded"
  | "processing"
  | "ready_for_review"
  | "failed"
  | "confirmed"
  | "cancelled";

export type SupplierInvoiceLineStatus = "matched" | "needs_review" | "ignored";

export type SupplierInvoiceImportLineDto = {
  id: string;
  line_index: number;
  description: string;
  /** Código de artigo na fatura do fornecedor (ex.: 019000). */
  supplier_article_code: string | null;
  quantity: number;
  unit: string | null;
  unit_price_net: number | null;
  unit_price_gross: number | null;
  vat_rate: number | null;
  /** Desconto em percentagem (0–100). Ex.: 10 para 10%. Nulo se sem desconto. */
  discount_pct: number | null;
  line_total_net: number | null;
  line_total_gross: number | null;
  stock_item_id: string | null;
  match_confidence: number | null;
  line_status: SupplierInvoiceLineStatus;
  notes: string | null;
};

export type SupplierInvoiceImportSummaryDto = {
  id: string;
  status: SupplierInvoiceImportStatus;
  file_name: string;
  file_mime: string;
  file_sha256: string;
  file_size: number;
  supplier_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  currency: string;
  subtotal: number | null;
  tax_total: number | null;
  total: number | null;
  business_key: string | null;
  duplicate_warning: boolean;
  duplicate_of_import_id: string | null;
  parse_error: string | null;
  lines: SupplierInvoiceImportLineDto[];
  created_at: string;
  updated_at: string;
  confirmed_at: string | null;
};

export type UpdateSupplierInvoiceImportBody = {
  supplier_name?: string | null;
  invoice_number?: string | null;
  /** Formato YYYY-MM-DD. */
  invoice_date?: string | null;
  currency?: string;
  subtotal?: number | null;
  tax_total?: number | null;
  total?: number | null;
};

export type ConfirmSupplierInvoiceImportBody = {
  /** Se true, substitui movimentos de import(s) anterior(es) com a mesma chave de negócio. */
  override_duplicate?: boolean;
  /**
   * Data dos movimentos de stock gerados (YYYY-MM-DD ou ISO 8601).
   * Se omitido, usa a data de hoje (dia em que se confirma a fatura).
   */
  movement_date?: string | null;
  /** Ajustes por linha antes de aplicar (opcional). */
  lines?: Array<{
    line_id: string;
    stock_item_id?: string | null;
    ignored?: boolean;
    /** Quantidade em unidades de stock (pode diferir da fatura por conversão de embalagem). */
    quantity?: number;
    /** Preço unitário com IVA (gross). Se fornecido, sobrepõe o valor extraído. */
    unit_price?: number;
    /** Taxa de IVA em percentagem (ex.: 23 para 23%). Se fornecido, sobrepõe o valor extraído. */
    vat_rate_pct?: number;
  }>;
};

export type ConfirmSupplierInvoiceImportResult = {
  import_id: string;
  status: "confirmed";
  movements_inserted: number;
  stock_items_updated: number;
  replaced_import_ids: string[];
};
