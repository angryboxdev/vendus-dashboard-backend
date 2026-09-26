export interface AiExtractedLine {
  description: string;
  quantity: number | null;
  unitPriceWithoutVat: number | null;
  vatRate: number | null;
  vatAmount: number | null;
  totalWithoutVat: number | null;
  totalWithVat: number | null;
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
  validationIssues: string[];
}
