import type { FiscalQr, PdfContent, ReadingIssue, ReadLine, ReadVatRow } from "../../entities/invoice-reading.js";

/** Linha lida pelo layout, antes de aplicar descontos e resolver a taxa de IVA. */
export type LayoutLine = Omit<ReadLine, "discountCents" | "netCents" | "vatRate">;

/** Desconto impresso fora da linha do artigo (ex.: «Leve Mais Pague Menos … MOT»). */
export interface LayoutDiscount {
  page: number;
  description: string;
  amountCents: number;
  vatCode: string | null;
  promoCode: string | null;
}

export interface LayoutResult {
  header: { documentNumber: string | null; atcud: string | null; issuerNif: string | null; buyerNif: string | null; issueDate: string | null };
  lines: LayoutLine[];
  discounts: LayoutDiscount[];
  footer: {
    discountTotalCents: number | null;
    itemCountText: string | null;
    depositCountText: string | null;
    netTotalCents: number | null;
    depositTotalCents: number | null;
    vatTable: ReadVatRow[];
    totalCents: number | null;
  };
  /** Subtotais «a transportar/transportado»: soma das linhas até `afterLineIndex` (inclusive). */
  carried: { page: number; cents: number; afterLineIndex: number }[];
  issues: ReadingIssue[];
}

/** Leitor determinístico de um layout de fatura (um por fornecedor/formato). */
export interface InvoiceLayout {
  readonly id: string;
  detect(content: PdfContent, qr: FiscalQr | null): boolean;
  parse(content: PdfContent): LayoutResult;
}
