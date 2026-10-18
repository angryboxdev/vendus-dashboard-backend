/**
 * Repartição financeira do modo «Por valores» (F2 v1.2 §2.2): descrição +
 * subcategoria de CC (+ loja quando aplicável) + montante líquido (sem IVA,
 * depois de descontos). Não é um artigo, não tem quantidade, SKU nem taxa de
 * IVA — o IVA fica no quadro fiscal do documento, por taxa.
 */
export interface InvoiceAllocation {
  id: string;
  invoiceId: string;
  position: number;
  description: string;
  costCenterGroupId: string | null;
  costCenterCategoryId: string;
  locationId: string | null;
  /** Cêntimos, magnitude positiva (também em notas de crédito). */
  netCents: number;
}
