import { parseDecimal, toCents } from "../../../../../kernel/money/decimal.js";
import type { FiscalQr, PdfContent } from "../../entities/invoice-reading.js";
import type { BarcodeState, DocumentKind, PaymentDocumentReading, PaymentObligationLine, PaymentReadingIssue } from "../../entities/payment-document.js";
import { pageRows, type PdfRow } from "./pdf-rows.js";

/**
 * Documentos de cobrança do Estado lidos só pelo texto nativo (sem IA):
 * - AT «Declaração de retenções na fonte» (referência de pagamento ao Estado, 15 dígitos);
 * - Segurança Social «Referência para pagamento» (entidade + referência MB).
 * Os campos vêm dos rótulos do documento, nunca de posições dentro do código de
 * barras. O código de acesso e o NISS da SS não são lidos.
 */

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
const MONEY = /^\d{1,3}(\.\d{3})*,\d{2}$|^\d+,\d{2}$/;
const cents = (t: string | null | undefined): number | null => {
  if (!t) return null;
  const d = parseDecimal(t.replace(/€/g, "").trim(), ",");
  return d ? toCents(d) : null;
};
const MONTHS = ["JANEIRO", "FEVEREIRO", "MARCO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];

function allRows(content: PdfContent): PdfRow[] {
  return content.pages.flatMap((p) => pageRows(p));
}

export function detectDocumentKind(content: PdfContent, qr: FiscalQr | null): DocumentKind {
  const text = norm(allRows(content).map((r) => r.text).join("\n"));
  if (/DECLARACAO DE RETENCOES NA FONTE/.test(text) && /(AUTORIDADE TRIBUTARIA|MINISTERIO DAS FINANCAS)/.test(text) && /REFERENCIA PARA PAGAMENTO/.test(text)) return "at_withholding";
  if (/REFERENCIA PARA PAGAMENTO/.test(text) && /SEGURANCA SOCIAL/.test(text) && /MULTIBANCO/.test(text) && /CONTRIBUICOES/.test(text)) return "ss_payment_reference";
  if (qr) return "commercial_invoice";
  return "unknown";
}

/**
 * Valor por baixo de um rótulo: primeira palavra que bate com `pattern`, nas
 * linhas seguintes (até `maxGap` pt), a começar perto da coluna do rótulo.
 */
function valueBelow(rows: PdfRow[], label: RegExp, pattern: RegExp, maxGap = 40): string | null {
  for (const r of rows) {
    const m = label.exec(norm(r.text));
    if (!m) continue;
    // Posição do rótulo: a palavra onde o texto encontrado começa (o texto da linha são as palavras unidas por espaço).
    let offset = 0;
    const word = r.words.find((w) => (offset += w.text.length + 1) > m.index) ?? r.words[0]!;
    const lx = word.x;
    for (const below of rows) {
      if (below.page !== r.page || below.y >= r.y || r.y - below.y > maxGap) continue;
      const hit = below.words.find((w) => w.x >= lx - 30 && w.x <= lx + 160 && pattern.test(w.text));
      if (hit) return hit.text;
    }
  }
  return null;
}

const rowMatch = (rows: PdfRow[], re: RegExp) => {
  for (const r of rows) {
    const m = re.exec(r.text);
    if (m) return m;
  }
  return null;
};

export function readAtWithholding(content: PdfContent): Omit<PaymentDocumentReading, "barcode" | "issues" | "status"> & { issues: PaymentReadingIssue[] } {
  const rows = allRows(content);
  const issues: PaymentReadingIssue[] = [];
  const documentNumber = valueBelow(rows, /NUMERO DO DOCUMENTO/, /^\d{6,}$/);
  const taxpayerNif = valueBelow(rows, /NUMERO DE IDENTIFICACAO FISCAL/, /^\d{9}$/);
  const lines: PaymentObligationLine[] = [];
  for (const r of rows) {
    const m = /(\d{3})\s+-\s+(.+?)\s+(\d{1,3}(?:\.\d{3})*,\d{2})$/.exec(r.text);
    if (m) lines.push({ code: m[1]!, description: `${m[1]} - ${m[2]!.trim()}`, amountCents: cents(m[3])!, interestCents: 0, totalCents: cents(m[3])! });
  }
  const per = rowMatch(rows.map((r) => ({ ...r, text: norm(r.text) })), /PERIODO\s+(\d{4})\s*\/\s*([A-Z]+)/);
  const monthIdx = per ? MONTHS.indexOf(per[2]!) : -1;
  const period = per && monthIdx >= 0 ? `${per[1]}-${String(monthIdx + 1).padStart(2, "0")}` : null;
  const totalCents = cents(rowMatch(rows, /VALOR A PAGAR\s+(\S+)$/i)?.[1]);
  const importancia = cents(valueBelow(rows, /IMPORTANCIA A PAGAR/, /^\d[\d.]*,\d{2}$/));
  const received = rowMatch(rows, /rece(?:p)?[cç][aã]o da declara[cç][aã]o:\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/i)?.[1] ?? null;
  const refText = valueBelow(rows, /REFERENCIA PARA PAGAMENTO/, /^\d{3}(\.\d{3}){4}$|^\d{15}$/);
  const paymentReference = refText ? refText.replace(/\./g, "") : null;
  const dueDate = valueBelow(rows, /DATA LIMITE DE PAGAMENTO/, /^\d{4}-\d{2}-\d{2}$/);
  const printed = rows.find((r) => r.words.length === 1 && /^\d{30,60}$/.test(r.text))?.text ?? null;

  if (paymentReference && !/^\d{15}$/.test(paymentReference)) issues.push({ code: "reference_format", blocking: true, detail: `Referência ao Estado com ${paymentReference.length} dígitos (esperados 15).` });
  const linesTotal = lines.reduce((a, l) => a + l.totalCents, 0);
  if (totalCents !== null && lines.length && linesTotal !== totalCents) issues.push({ code: "totals_mismatch", blocking: true, detail: `Soma dos impostos ${eur(linesTotal)} € ≠ valor a pagar ${eur(totalCents)} €.` });
  if (totalCents !== null && importancia !== null && importancia !== totalCents) issues.push({ code: "totals_mismatch", blocking: true, detail: `Importância a pagar ${eur(importancia)} € ≠ valor a pagar ${eur(totalCents)} €.` });
  const codes = new Set(lines.map((l) => l.code));
  return {
    kind: "at_withholding",
    obligationType: "obrigacao_fiscal",
    subtype: codes.size === 1 && codes.has("104") ? "retencoes_irs_prediais" : "retencoes_na_fonte",
    issuer: "AT",
    taxpayerNif,
    documentNumber,
    period,
    lines,
    paymentReference,
    mbEntity: null,
    amountCents: totalCents,
    interestCents: 0,
    totalCents: totalCents ?? importancia,
    dueDate,
    issueDate: null,
    declarationReceivedAt: received,
    vat: "not_applicable",
    barcodePrintedText: printed,
    fieldSources: { documentNumber: "text", taxpayerNif: "text", period: "text", paymentReference: "text", totalCents: "text", dueDate: "text" },
    issues,
  };
}

export function readSsPaymentReference(content: PdfContent): Omit<PaymentDocumentReading, "barcode" | "issues" | "status"> & { issues: PaymentReadingIssue[] } {
  const rows = allRows(content);
  const issues: PaymentReadingIssue[] = [];
  const issueDate = valueBelow(rows, /DATA DE EMISSAO/, /^\d{4}-\d{2}-\d{2}$/);
  const validUntil = valueBelow(rows, /DATA DE VALIDADE/, /^\d{4}-\d{2}-\d{2}$/);
  const taxpayerNif = valueBelow(rows, /NUMERO DE IDENTIFICACAO FISCAL/, /^\d{9}$/);
  const mbEntity = valueBelow(rows, /^ENTIDADE\b/, /^\d{5}$/);
  const paymentReference = valueBelow(rows, /\bREFERENCIA\b(?!.*PAGAMENTO)/, /^\d{9}$/);
  const mbValue = cents(valueBelow(rows, /\bVALOR\b/, /^\d[\d.]*,\d{2}€?$/));
  const lines: PaymentObligationLine[] = [];
  for (const r of rows) {
    const m = /^(\d{6})\s+-\s+(.+?)\s+(\S+)\s+(\S+)\s+(\S+)$/.exec(r.text);
    if (m && MONEY.test(m[3]!) && MONEY.test(m[4]!) && MONEY.test(m[5]!)) {
      lines.push({ code: m[1]!, description: m[2]!.replace(/\.$/, "").trim(), amountCents: cents(m[3])!, interestCents: cents(m[4])!, totalCents: cents(m[5])! });
    }
  }
  const totalCents = cents(rowMatch(rows, /Total a pagar\s+(\S+?)\s*€?$/i)?.[1]);
  const periods = [...new Set(lines.map((l) => `${l.code.slice(0, 4)}-${l.code.slice(4, 6)}`))];
  const amount = lines.reduce((a, l) => a + l.amountCents, 0);
  const interest = lines.reduce((a, l) => a + l.interestCents, 0);
  const linesTotal = lines.reduce((a, l) => a + l.totalCents, 0);
  if (totalCents !== null && lines.length && linesTotal !== totalCents) issues.push({ code: "totals_mismatch", blocking: true, detail: `Soma do detalhe ${eur(linesTotal)} € ≠ total a pagar ${eur(totalCents)} €.` });
  if (totalCents !== null && mbValue !== null && mbValue !== totalCents) issues.push({ code: "totals_mismatch", blocking: true, detail: `Valor Multibanco ${eur(mbValue)} € ≠ total a pagar ${eur(totalCents)} €.` });
  if (lines.some((l) => l.amountCents + l.interestCents !== l.totalCents)) issues.push({ code: "totals_mismatch", blocking: true, detail: "Contribuição + juros ≠ total numa linha do detalhe." });
  return {
    kind: "ss_payment_reference",
    obligationType: "obrigacao_contributiva",
    subtype: "seguranca_social_entidade_empregadora",
    issuer: "SS",
    taxpayerNif,
    documentNumber: null,
    period: periods.length === 1 ? periods[0]! : null,
    lines,
    paymentReference,
    mbEntity,
    amountCents: lines.length ? amount : null,
    interestCents: interest,
    totalCents: totalCents ?? mbValue,
    dueDate: validUntil,
    issueDate,
    declarationReceivedAt: null,
    vat: "not_applicable",
    barcodePrintedText: null,
    fieldSources: { taxpayerNif: "text", period: "text", paymentReference: "text", mbEntity: "text", totalCents: "text", dueDate: "text" },
    issues,
  };
}

const eur = (c: number) => (c / 100).toFixed(2).replace(".", ",");

/**
 * Leitura completa: campos do texto + estado do código de barras + verificações
 * (campos em falta, código ≠ texto impresso, prazo expirado, contribuinte ≠ organização).
 */
export function readPaymentDocument(input: {
  content: PdfContent;
  kind: "at_withholding" | "ss_payment_reference";
  barcode: BarcodeState;
  today: string;
  organizationNif: string | null;
}): PaymentDocumentReading {
  const base = input.kind === "at_withholding" ? readAtWithholding(input.content) : readSsPaymentReference(input.content);
  const issues = [...base.issues];
  const required: [string, unknown][] = input.kind === "at_withholding"
    ? [["número do documento", base.documentNumber], ["NIF", base.taxpayerNif], ["período", base.period], ["referência de pagamento", base.paymentReference], ["valor", base.totalCents], ["data limite", base.dueDate]]
    : [["NIF", base.taxpayerNif], ["período", base.period], ["entidade", base.mbEntity], ["referência", base.paymentReference], ["valor", base.totalCents], ["validade", base.dueDate]];
  for (const [label, v] of required) if (v === null || v === undefined) issues.push({ code: "field_missing", blocking: true, detail: `Campo não encontrado: ${label}.` });

  if (input.barcode.status === "decoded" && base.barcodePrintedText && input.barcode.payload !== base.barcodePrintedText) {
    issues.push({ code: "barcode_text_mismatch", blocking: true, detail: "O código de barras lido é diferente do valor impresso por baixo dele." });
  }
  if (input.barcode.status === "unreadable") issues.push({ code: "barcode_unreadable", blocking: false, detail: "Há um código de barras visível mas ilegível; os campos foram lidos do texto." });
  if (base.dueDate && base.dueDate < input.today) issues.push({ code: "due_date_passed", blocking: false, detail: `O prazo terminou a ${base.dueDate}.` });
  if (input.organizationNif && base.taxpayerNif && base.taxpayerNif !== input.organizationNif) {
    issues.push({ code: "taxpayer_not_organization", blocking: true, detail: "O NIF do documento não é o da organização." });
  }
  return { ...base, barcode: input.barcode, issues, status: issues.some((i) => i.blocking) ? "needs_attention" : "ready" };
}
