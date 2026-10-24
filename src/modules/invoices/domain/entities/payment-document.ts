/**
 * Documento de cobrança (obrigação perante o Estado): não é uma compra nem uma
 * fatura — sem IVA (não aplicável, ≠ 0%), sem linhas de artigos, sem Stock.
 * A leitura não prova pagamento nem cria dívida; só propõe para revisão.
 */

export type DocumentKind = "commercial_invoice" | "at_withholding" | "ss_payment_reference" | "unknown";

/** Código de barras 1D: inexistente, lido (com o valor bruto) ou visível mas ilegível. */
export type BarcodeState =
  | { status: "absent" }
  | { status: "decoded"; symbology: "CODE128"; payload: string; page: number }
  | { status: "unreadable"; page: number };

export type FieldSource = "text" | "barcode";

export interface PaymentObligationLine {
  /** AT: código de imposto (ex.: "104"); SS: período «AAAAMM» da linha. */
  code: string;
  description: string;
  amountCents: number;
  interestCents: number;
  totalCents: number;
}

export type PaymentReadingIssueCode =
  | "field_missing"
  | "totals_mismatch"
  | "reference_format"
  | "barcode_text_mismatch"
  | "barcode_unreadable"
  | "due_date_passed"
  | "taxpayer_not_organization";

export interface PaymentReadingIssue {
  code: PaymentReadingIssueCode;
  blocking: boolean;
  detail: string;
}

export interface PaymentDocumentReading {
  kind: "at_withholding" | "ss_payment_reference";
  obligationType: "obrigacao_fiscal" | "obrigacao_contributiva";
  subtype: "retencoes_irs_prediais" | "retencoes_na_fonte" | "seguranca_social_entidade_empregadora";
  issuer: "AT" | "SS";
  taxpayerNif: string | null;
  documentNumber: string | null;
  /** «AAAA-MM» */
  period: string | null;
  lines: PaymentObligationLine[];
  /** AT: referência de pagamento ao Estado (15 dígitos). SS: referência MB (9 dígitos). */
  paymentReference: string | null;
  /** Entidade Multibanco (SS). */
  mbEntity: string | null;
  amountCents: number | null;
  interestCents: number;
  totalCents: number | null;
  dueDate: string | null;
  issueDate: string | null;
  /** AT: receção da declaração — não é prova de pagamento. */
  declarationReceivedAt: string | null;
  vat: "not_applicable";
  barcode: BarcodeState;
  /** Valor do código de barras impresso em texto (quando existe), para conferência. */
  barcodePrintedText: string | null;
  fieldSources: Partial<Record<"documentNumber" | "taxpayerNif" | "period" | "paymentReference" | "mbEntity" | "totalCents" | "dueDate", FieldSource>>;
  issues: PaymentReadingIssue[];
  status: "ready" | "needs_attention";
}
