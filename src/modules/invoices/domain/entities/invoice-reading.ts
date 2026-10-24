/**
 * Leitura determinística de uma fatura (sem IA): conteúdo do PDF → QR fiscal AT
 * + linhas reais lidas do texto nativo, reconciliadas com o motor de valores.
 * Valores em cêntimos inteiros; textos numéricos guardados tal como impressos.
 */

/** Palavra do texto nativo do PDF com a posição (pontos PDF, origem em baixo à esquerda). */
export interface PdfWord {
  text: string;
  x: number;
  y: number;
  width: number;
}

export interface PdfPageContent {
  number: number;
  width: number;
  height: number;
  words: PdfWord[];
}

/** O que o adapter de PDF entrega ao domínio: texto com posições + QR descodificados localmente. */
export interface PdfContent {
  pages: PdfPageContent[];
  qrCodes: { page: number; text: string }[];
}

/** Base e IVA de um espaço fiscal/taxa do QR (cêntimos). */
export interface FiscalQrTaxBand {
  baseCents: number;
  vatCents: number;
}

/** Espaço fiscal do QR (I = primeiro, J/K = outros espaços fiscais). */
export interface FiscalQrTaxSpace {
  space: "I" | "J" | "K";
  /** Região fiscal tal como no QR (PT, PT-AC, PT-MA ou código ISO). */
  region: string;
  exemptBaseCents: number;
  reduced: FiscalQrTaxBand | null;
  intermediate: FiscalQrTaxBand | null;
  normal: FiscalQrTaxBand | null;
}

/** Mensagem do QR fiscal AT interpretada (Portaria 195/2020; campos A–S). */
export interface FiscalQr {
  issuerNif: string;
  buyerNif: string | null;
  buyerCountry: string | null;
  documentType: string;
  documentStatus: string | null;
  issueDate: string | null;
  documentNumber: string;
  atcud: string | null;
  taxSpaces: FiscalQrTaxSpace[];
  /** L — não sujeito/não tributável em IVA. */
  notSubjectCents: number;
  /** M — imposto do selo. */
  stampDutyCents: number;
  /** N — total de impostos. */
  totalTaxCents: number;
  /** O — total do documento com impostos. */
  totalCents: number;
  /** P — retenção na fonte. */
  withholdingCents: number;
  hashExcerpt: string | null;
  certificate: string | null;
  /** Todos os campos lidos (chave → valor), incluindo os não interpretados. */
  fields: Record<string, string>;
}

export type ReadLineKind = "product" | "deposit";

export interface ReadLine {
  /** Ordem física no documento (0, 1, …) — ID estável da ocorrência. */
  index: number;
  page: number;
  kind: ReadLineKind;
  /** Código do artigo do fornecedor, como texto (zeros à esquerda preservados). */
  supplierCode: string | null;
  description: string;
  pack: string | null;
  /** Textos tal como impressos (ex.: "22,585", "2", "45,17", "20.000"). */
  basePriceText: string | null;
  factorText: string | null;
  unitPriceText: string | null;
  quantityText: string;
  grossCents: number;
  discountCents: number;
  netCents: number;
  /** Código de IVA do fornecedor (ex.: Makro "2") e taxa resolvida pelo quadro do documento. */
  vatCode: string | null;
  vatRate: string | null;
  /** Indicadores das colunas finais (ex.: "D" = não sujeito, "P"). */
  flags: string[];
  promoCode: string | null;
  /** Depósito/caução: linha do artigo a que pertence. */
  relatedLineIndex: number | null;
  /** Anotações informativas (ex.: IEC incluído no preço) — nunca somadas. */
  notes: string[];
  rawText: string;
}

export interface ReadVatRow {
  code: string | null;
  rate: string;
  baseCents: number;
  vatCents: number;
}

export type ReadingIssueCode =
  | "qr_missing"
  | "qr_invalid"
  | "qr_totals_inconsistent"
  | "qr_header_mismatch"
  | "qr_vat_table_mismatch"
  | "layout_unknown"
  | "no_lines"
  | "unrecognized_row"
  | "line_total_mismatch"
  | "vat_code_unknown"
  | "discount_reference_missing"
  | "discount_without_reference"
  | "item_count_mismatch"
  | "deposit_count_mismatch"
  | "net_total_mismatch"
  | "carried_total_mismatch"
  | "amounts_not_reconciled";

export interface ReadingIssue {
  code: ReadingIssueCode;
  /** Bloqueia a confirmação (em lote ou individual) até revisão humana. */
  blocking: boolean;
  detail: string;
  page?: number;
  lineIndex?: number;
}

export interface InvoiceReading {
  /** Leitor usado (ex.: "layout:makro"); null quando nenhum layout reconheceu o documento. */
  layout: string | null;
  qr: FiscalQr | null;
  header: {
    issuerNif: string | null;
    buyerNif: string | null;
    documentType: string | null;
    documentNumber: string | null;
    atcud: string | null;
    issueDate: string | null;
  };
  lines: ReadLine[];
  vatTable: ReadVatRow[];
  totals: {
    grossCents: number;
    discountCents: number;
    netCents: number;
    vatCents: number;
    totalCents: number | null;
    depositsCents: number;
    productUnits: string;
    depositUnits: string;
  };
  issues: ReadingIssue[];
  /** ready = tudo lido e reconciliado ao cêntimo; needs_attention = há problemas bloqueantes; unsupported = sem layout. */
  status: "ready" | "needs_attention" | "unsupported";
}
