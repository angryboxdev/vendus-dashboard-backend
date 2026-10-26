import { dec, parseDecimal, pctOfCents, toCents } from "../../../../../kernel/money/decimal.js";
import type { AiExtractedLine, AiExtractionResult } from "../../entities/ai-extraction-result.js";
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

const LINE_TOLERANCE_CENTS = 1;
const lineNet = (l: AiExtractedLine): number | null =>
  l.totalWithoutVat ?? (l.totalWithVat != null && l.vatAmount != null ? l.totalWithVat - l.vatAmount : null);
const eur = (c: number) => (c / 100).toFixed(2).replace(".", ",");

/**
 * As linhas lidas pela IA fecham com o QR? A soma dos líquidos tem de dar a base total do
 * QR e, quando todas as taxas (do QR e das linhas) são conhecidas, a base de cada taxa.
 */
export function linesReconcileWithQr(lines: AiExtractedLine[], qr: FiscalQr): boolean {
  if (!lines.length) return false;
  const nets = lines.map(lineNet);
  if (nets.some((n) => n === null)) return false;
  const base = qrBands(qr).reduce((a, b) => a + b.baseCents, 0);
  if (Math.abs((nets as number[]).reduce((a, n) => a + n, 0) - base) > LINE_TOLERANCE_CENTS) return false;
  const vat = qrVatRows(qr, lines.map((l) => (l.vatRate == null ? "" : String(l.vatRate))));
  if (vat.some((v) => v.code === null) || lines.some((l) => l.vatRate == null)) return true;
  return vat.every((v) => {
    const sum = lines.reduce((a, l, i) => (Number(l.vatRate) === Number(v.rate) ? a + nets[i]! : a), 0);
    return Math.abs(sum - v.baseCents) <= LINE_TOLERANCE_CENTS;
  });
}

/** Uma linha por taxa do QR — sempre certa ao cêntimo; o utilizador classifica-a na revisão. */
export function qrRateLines(qr: FiscalQr): AiExtractedLine[] {
  return qrVatRows(qr).map((v) => {
    const label =
      v.kind === "exempt" ? "Valor isento de IVA" : v.kind === "not_subject" ? "Valor não sujeito a IVA" : `Valor à taxa de IVA ${v.rate} %`;
    return {
      description: `${label} (QR fiscal)`,
      quantity: 1,
      unitPriceWithoutVat: v.baseCents,
      vatRate: v.code === null ? null : Number(v.rate),
      vatAmount: v.vatCents,
      totalWithoutVat: v.baseCents,
      totalWithVat: v.baseCents + v.vatCents,
    };
  });
}

/**
 * Linhas por taxa do QR: o emitente arredonda o IVA linha a linha (ex.: águas 25,02 + 5,06 + …
 * a 6 % = 3,39 €), mas base × taxa da linha única dá outro cêntimo (56,59 × 6 % = 3,40 €). Com
 * diferença de no máximo 1 cêntimo por taxa, devolve o aviso `vat_rounded_per_line` — a revisão
 * aplica sozinha o ajuste de arredondamento e a fatura fecha com o documento.
 */
export function qrPerLineVatRoundingNote(qr: FiscalQr): { code: "vat_rounded_per_line"; blocking: false; detail: string } | null {
  let diff = 0;
  for (const v of qrVatRows(qr)) {
    if (v.code === null || Number(v.rate) === 0) continue;
    const d = v.vatCents - pctOfCents(v.baseCents, dec(v.rate));
    if (Math.abs(d) > LINE_TOLERANCE_CENTS) return null;
    diff += d;
  }
  if (!diff) return null;
  return {
    code: "vat_rounded_per_line",
    blocking: false,
    detail: `IVA arredondado linha a linha pelo emitente (${eur(diff)} € face ao cálculo por taxa) — aplicar o ajuste de arredondamento.`,
  };
}

/**
 * Regra do utilizador para faturas com QR lidas pela IA: «linhas conferidas». Se as linhas da IA
 * não fecham com o QR (ex.: documento de pagamento das águas — a IA misturou o resumo da 1.ª
 * página, criou uma linha «IVA» e leu 13 m³ como 13000), ficam as linhas por taxa do QR: a fatura
 * fecha sempre com o documento e pode ser confirmada.
 */
export function enforceQrLines(e: AiExtractionResult, qr: FiscalQr): { extraction: AiExtractionResult; note: string | null } {
  if (linesReconcileWithQr(e.lines, qr)) return { extraction: e, note: null };
  const aiNet = e.lines.reduce((a, l) => a + (lineNet(l) ?? 0), 0);
  const base = qrBands(qr).reduce((a, b) => a + b.baseCents, 0);
  return {
    extraction: { ...e, lines: qrRateLines(qr) },
    note: `As linhas lidas não fechavam com o QR fiscal (${eur(aiNet)} € vs. base ${eur(base)} €); ficaram as bases do QR por taxa de IVA — classifique-as na revisão.`,
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
