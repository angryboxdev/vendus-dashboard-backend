export interface AiExtractedLine {
  description: string;
  quantity: number | null;
  unitPriceWithoutVat: number | null;
  vatRate: number | null;
  vatAmount: number | null;
  totalWithoutVat: number | null;
  totalWithVat: number | null;
  /** Texto tal como impresso (ex.: "20.000", "1,235") — o motor resolve a leitura que reconcilia. */
  quantityText?: string | null;
  unitPriceText?: string | null;
  /** Bruto da linha antes de descontos (cêntimos), quando impresso. */
  grossWithoutDiscount?: number | null;
  /** Desconto comercial da linha: % (10 = 10%) ou valor em cêntimos. */
  discountPct?: number | null;
  discountAmount?: number | null;
  /** Só no leitor determinístico (E3): o que foi lido do documento para esta linha. */
  meta?: LineReadingMeta;
}

/** Metadados de uma linha lida pelo leitor determinístico (guardados em `invoice_lines.reading_meta`). */
export interface LineReadingMeta {
  supplierCode: string | null;
  page: number;
  order: number;
  kind: "product" | "deposit";
  vatCode: string | null;
  promoCode: string | null;
  /** Depósito/caução: ordem da linha do artigo a que pertence. */
  relatedOrder: number | null;
  notes: string[];
  /** Categoria sugerida na importação: origem e evidência (preenchido pela classificação). */
  classificationSource?: string | null;
  classificationEvidence?: string | null;
}

export interface AiExtractedAmounts {
  globalDiscountPct: number | null;
  globalDiscountAmount: number | null;
  /** Desconto impresso no rodapé (pode só resumir os das linhas). */
  footerDiscountAmount: number | null;
  /** Quadro de IVA por taxa (cêntimos). */
  vatSummary: { rate: number; baseCents: number; vatCents: number }[] | null;
}

export interface AiExtractionResult {
  supplierName: string | null;
  supplierNif: string | null;
  supplierAddress: string | null;
  supplierEmail: string | null;
  invoiceNumber: string | null;
  issueDate: Date | null;
  dueDate: Date | null;
  subtotalWithoutVat: number | null;  // in cents
  vatAmount: number | null;            // in cents
  totalWithVat: number | null;         // in cents
  currency: string | null;
  confidence: number;                  // 0.0 – 1.0
  /** null quando a IA não conseguiu determinar — o caller trata como "invoice". Valores sempre a magnitude positiva tal como no documento; o sinal é aplicado pela entidade Invoice. */
  documentType: "invoice" | "credit_note" | null;
  lines: AiExtractedLine[];
  /** Descontos e quadro de IVA do documento (task v1.2 §1.3) — opcionais; null quando ausentes. */
  amounts?: AiExtractedAmounts;
  validationIssues: string[];
}
