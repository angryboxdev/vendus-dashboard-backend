import { parseDecimal, toCents } from "../../../../../kernel/money/decimal.js";
import type { AiExtractionResult } from "../../entities/ai-extraction-result.js";
import type { FiscalQr, InvoiceReading } from "../../entities/invoice-reading.js";
import { qrBands } from "./fiscal-qr.js";
import { qrVatRows } from "./qr-rates.js";

/**
 * Fatura com QR fiscal lida pela IA (layout sem leitor determinístico): emitente,
 * número, data, tipo, bases, IVA e total passam a vir do QR — a IA só contribui
 * com o que o QR não tem (nome, prazo, linhas). O quadro de IVA só é substituído
 * quando todas as taxas do QR são identificáveis.
 */
export function applyQrToExtraction(e: AiExtractionResult, qr: FiscalQr): AiExtractionResult {
  const bands = qrBands(qr);
  const vat = qrVatRows(qr, e.lines.map((l) => (l.vatRate == null ? "" : String(l.vatRate))));
  const allRates = vat.every((v) => v.code !== null);
  return {
    ...e,
    supplierNif: qr.issuerNif,
    invoiceNumber: qr.documentNumber,
    issueDate: qr.issueDate ? new Date(`${qr.issueDate}T00:00:00Z`) : e.issueDate,
    documentType: qr.documentType === "NC" ? "credit_note" : "invoice",
    subtotalWithoutVat: bands.reduce((a, b) => a + b.baseCents, 0),
    vatAmount: qr.totalTaxCents,
    totalWithVat: qr.totalCents,
    amounts: {
      globalDiscountPct: e.amounts?.globalDiscountPct ?? null,
      globalDiscountAmount: e.amounts?.globalDiscountAmount ?? null,
      footerDiscountAmount: e.amounts?.footerDiscountAmount ?? null,
      vatSummary: allRates ? vat.map((v) => ({ rate: Number(v.rate), baseCents: v.baseCents, vatCents: v.vatCents })) : e.amounts?.vatSummary ?? null,
    },
  };
}

/**
 * Converte a leitura determinística (QR + texto do PDF) no mesmo formato que a
 * extração por IA devolve — o resto da importação (fornecedor, duplicados,
 * identidade fiscal, rascunho, revisão) fica igual. Nada é inventado: sem prazo
 * impresso fica sem prazo; a «confiança» só distingue reconciliado (1) de por rever (0,5).
 */
export function readingToExtraction(r: InvoiceReading): AiExtractionResult {
  const d = (text: string | null) => (text ? parseDecimal(text, ",") : null);
  const docType = r.header.documentType;
  return {
    supplierName: r.header.supplierName,
    supplierNif: r.header.issuerNif,
    supplierAddress: null,
    supplierEmail: null,
    invoiceNumber: r.header.documentNumber,
    issueDate: r.header.issueDate ? new Date(`${r.header.issueDate}T00:00:00Z`) : null,
    dueDate: r.header.dueDate ? new Date(`${r.header.dueDate}T00:00:00Z`) : null,
    subtotalWithoutVat: r.totals.netCents,
    vatAmount: r.totals.vatCents,
    totalWithVat: r.totals.totalCents,
    currency: "EUR",
    confidence: r.status === "ready" ? 1 : 0.5,
    documentType: docType === "NC" ? "credit_note" : docType ? "invoice" : null,
    lines: r.lines.map((l) => {
      const qty = d(l.quantityText);
      const price = d(l.unitPriceText);
      return {
        description: l.description,
        quantity: qty ? Number(qty.units) / 10 ** qty.scale : null,
        unitPriceWithoutVat: price ? toCents(price) : null,
        vatRate: l.vatRate === null ? null : Number(l.vatRate),
        vatAmount: null,
        totalWithoutVat: l.netCents,
        totalWithVat: null,
        quantityText: l.quantityText,
        unitPriceText: l.unitPriceText,
        grossWithoutDiscount: l.grossCents,
        discountPct: null,
        discountAmount: l.discountCents || null,
        meta: {
          supplierCode: l.supplierCode,
          page: l.page,
          order: l.index,
          kind: l.kind,
          vatCode: l.vatCode,
          promoCode: l.promoCode,
          relatedOrder: l.relatedLineIndex,
          notes: l.notes,
        },
      };
    }),
    amounts: {
      globalDiscountPct: null,
      globalDiscountAmount: null,
      footerDiscountAmount: null,
      vatSummary: r.vatTable.length ? r.vatTable.map((v) => ({ rate: Number(v.rate), baseCents: v.baseCents, vatCents: v.vatCents })) : null,
    },
    validationIssues: [],
  };
}
