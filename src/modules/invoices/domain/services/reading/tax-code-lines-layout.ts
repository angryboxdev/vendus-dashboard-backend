import { parseDecimal, toCents } from "../../../../../kernel/money/decimal.js";
import type { FiscalQr, PdfContent, ReadingIssue, ReadVatRow } from "../../entities/invoice-reading.js";
import type { InvoiceLayout, LayoutLine, LayoutResult } from "./invoice-layout.js";
import { dueDateOf } from "./due-date.js";
import { pageRows, type PdfRow } from "./pdf-rows.js";

/**
 * Leitor de faturas cujas linhas terminam com o CÓDIGO de IVA entre parênteses e cuja legenda
 * diz a taxa de cada código — ex.: documento de pagamento das águas (Águas do Porto; software
 * certificado 809): «1 Esc. Consumo Água … 13,0000 m3 em 37 dias 1,924800 25,02 (2)» e
 * «(2)IVA 6% … 56,59 3,39» / «(1)IVA N Suj. (Art.2º nº2 CIVA) … 30,05 0,0».
 *
 * - Linhas = filas que acabam em «valor (n)»; os subtotais de grupo («ÁGUA 30,08») não têm código.
 * - Vários documentos fiscais na mesma página (água + resíduos) são lidos todos: cada tabela tem
 *   a sua legenda; o mesmo código com taxas diferentes é um problema bloqueante.
 * - Estrito: só conta se as linhas reconciliarem com o(s) QR (o leitor confere); senão segue a IA.
 */

/** Valor com 1 ou 2 casas: este software corta o zero final («9,0» = 9,00; «0,2» = 0,20). */
const MONEY = /^-?\d{1,3}(?:\.\d{3})*,\d{1,2}$/;
const CODE = /^\((\d+)\)$/;
const LEGEND = /^\((\d+)\)IVA$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const NUMBER = /^\d+(?:,\d+)?$/;
const RATE = /^(\d+(?:[.,]\d+)?)%$/;
const NOT_SUBJECT = /^(n|n\.|suj\.?|isento|isenta|n\/suj\.?)$/i;

const cents = (text: string) => toCents(parseDecimal(/,\d$/.test(text) ? `${text}0` : text, ",")!);
const words = (r: PdfRow) => r.words.map((w) => w.text);

function legendOf(r: PdfRow): { code: string; rate: string | null; baseCents: number | null; vatCents: number | null } | null {
  const ws = words(r);
  const m = LEGEND.exec(ws[0] ?? "");
  if (!m) return null;
  const rest = ws.slice(1);
  const pct = rest.map((w) => RATE.exec(w)).find(Boolean);
  const rate = pct ? pct[1]!.replace(",", ".") : rest.some((w) => NOT_SUBJECT.test(w)) ? "0" : null;
  // «… 56,59 3,39» (base e IVA) — o IVA de taxa 0 pode vir como «0,0».
  const nums = rest.filter((w) => MONEY.test(w));
  const toC = (t: string | undefined) => (t ? cents(t) : null);
  return { code: m[1]!, rate, baseCents: toC(nums.at(-2)), vatCents: toC(nums.at(-1)) };
}

function lineOf(r: PdfRow, index: number): LayoutLine | null {
  const ws = words(r);
  if (ws.length < 3 || LEGEND.test(ws[0]!)) return null;
  const code = CODE.exec(ws.at(-1)!);
  const value = ws.at(-2)!;
  if (!code || !MONEY.test(value)) return null;
  const firstDate = ws.findIndex((w) => DATE.test(w));
  const lastDate = ws.reduce((acc, w, i) => (DATE.test(w) ? i : acc), -1);
  // Descrição: até à 1.ª data (período) ou, sem datas, até ao 1.º número.
  const descEnd = firstDate >= 0 ? firstDate : ws.findIndex((w, i) => i > 0 && NUMBER.test(w));
  const description = ws.slice(0, descEnd > 0 ? descEnd : ws.length - 2).join(" ");
  const tail = ws.slice((lastDate >= 0 ? lastDate : descEnd) + 1, -2);
  const quantityText = tail.find((w) => NUMBER.test(w)) ?? "1";
  const unit = ws.at(-3);
  const unitPriceText = unit && NUMBER.test(unit) && unit.includes(",") && tail.indexOf(unit) > tail.indexOf(quantityText) ? unit : null;
  return {
    index,
    page: r.page,
    kind: "product",
    supplierCode: null,
    description,
    pack: null,
    basePriceText: null,
    factorText: null,
    unitPriceText,
    quantityText,
    grossCents: cents(value),
    vatCode: code[1]!,
    flags: [],
    promoCode: null,
    relatedLineIndex: null,
    notes: [],
    rawText: ws.join(" "),
  };
}

export class TaxCodeLinesLayout implements InvoiceLayout {
  readonly id = "layout:tax-code-lines";
  readonly strict = true;

  detect(content: PdfContent, qr: FiscalQr | null): boolean {
    if (!qr) return false;
    const rows = content.pages.flatMap((p) => pageRows(p));
    return rows.some((r) => legendOf(r)?.rate != null) && rows.some((r) => lineOf(r, 0) !== null);
  }

  parse(content: PdfContent, qr: FiscalQr | null): LayoutResult {
    const issues: ReadingIssue[] = [];
    const lines: LayoutLine[] = [];
    const vat = new Map<string, ReadVatRow>();
    for (const page of content.pages) {
      for (const r of pageRows(page)) {
        const legend = legendOf(r);
        if (legend) {
          if (legend.rate === null) {
            issues.push({ code: "vat_code_unknown", blocking: true, detail: `Legenda de IVA «${r.words.map((w) => w.text).join(" ")}» sem taxa reconhecível.`, page: r.page });
            continue;
          }
          const prev = vat.get(legend.code);
          if (prev && prev.rate !== legend.rate) {
            issues.push({ code: "vat_code_unknown", blocking: true, detail: `Código de IVA (${legend.code}) com taxas diferentes no documento (${prev.rate}% e ${legend.rate}%).`, page: r.page });
            continue;
          }
          vat.set(legend.code, {
            code: legend.code,
            rate: legend.rate,
            baseCents: (prev?.baseCents ?? 0) + (legend.baseCents ?? 0),
            vatCents: (prev?.vatCents ?? 0) + (legend.vatCents ?? 0),
          });
          continue;
        }
        const line = lineOf(r, lines.length);
        if (line) lines.push(line);
      }
    }
    if (!lines.length) issues.push({ code: "no_lines", blocking: true, detail: "Nenhuma linha com código de IVA encontrada." });
    return {
      header: {
        supplierName: null,
        // Débito/prazo do documento de pagamento (ex.: «Débito a partir de 2026-11-03»); nunca antes da emissão.
        dueDate: ((d) => (d && (!qr?.issueDate || d >= qr.issueDate) ? d : null))(dueDateOf(content)),
        documentNumber: qr?.documentNumber ?? null,
        atcud: qr?.atcud ?? null,
        issuerNif: qr?.issuerNif ?? null,
        buyerNif: qr?.buyerNif ?? null,
        issueDate: qr?.issueDate ?? null,
      },
      lines,
      discounts: [],
      footer: {
        discountTotalCents: null,
        itemCountText: null,
        depositCountText: null,
        netTotalCents: null,
        depositTotalCents: null,
        vatTable: [...vat.values()],
        totalCents: null,
      },
      carried: [],
      issues,
    };
  }
}
