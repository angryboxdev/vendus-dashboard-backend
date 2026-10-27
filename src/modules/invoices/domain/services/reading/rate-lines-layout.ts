import { parseDecimal, toCents } from "../../../../../kernel/money/decimal.js";
import type { FiscalQr, PdfContent, ReadingIssue, ReadVatRow } from "../../entities/invoice-reading.js";
import type { InvoiceLayout, LayoutDiscount, LayoutLine, LayoutResult } from "./invoice-layout.js";
import { pageRows, type PdfRow } from "./pdf-rows.js";
import { qrVatRows } from "./qr-rates.js";
import { dueDateOf } from "./due-date.js";

/**
 * Leitor de faturas cujas linhas trazem a TAXA de IVA escrita na própria linha — ex.: eletricidade.
 * Dois formatos:
 * - taxa seguida do valor (Alfa Energia, Primavera): «Acesso às redes em Simples 24/08/2026
 *   23/09/2026 1 187,00 kWh 0,060700 23% 72,05 €»;
 * - valor seguido da taxa e do código (Endesa): «Termo Fixo Acesso às Redes 32 dias 0,317400€/dia
 *   … 10,16 € -2,23 € 7,93 € 23% (c)» — o valor da linha é o último antes da taxa (já com desconto).
 * O cabeçalho da tabela («… Quantidade … IVA … Valor») diz onde acaba a descrição (que pode ter
 * números: «Contribuição AudioVisual 2,85 € x 12 meses /»).
 *
 * - Linhas = filas com «n%» isolado FORA da coluna da descrição, junto a um valor (subtotais
 *   «Total …:», o quadro «IVA(23%) 57,40 €» e o resumo «(c) IVA 23% 16,12 €» nunca contam).
 * - Texto rodado na margem («DETALHE FATURA») é ignorado.
 * - Quantidades com milhares separados por espaço («1 187,00») juntam-se.
 * - As taxas vêm do QR (quadro de IVA do documento); estrito: só conta se reconciliar.
 */

const RATE = /^(\d{1,2}(?:[.,]\d+)?)%$/;
const MONEY = /^-?\d{1,3}(?:[ .]\d{3})*,\d{2}€?$/;
const CODE = /^\([a-z0-9]{1,2}\)$/i;
const NUMBER = /^\d+(?:,\d+)?$/;
const THOUSANDS = /^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/;
/** Preço unitário com a unidade colada: «0,317400€/dia», «2,850000€/meses». */
const UNIT_PRICE = /^(\d+,\d+)€\/\S+$/;
const DATE = /^(\d{2}[/-]\d{2}[/-]\d{4}|\d{4}-\d{2}-\d{2})$/;
const HEADER_COLUMN = /^(per[ií]odo|quantidade|qtd\.?|quant\.?|data|in[ií]cio)$/i;

const cents = (text: string) => toCents(parseDecimal(text.replace(/€$/, "").replace(/[ .](?=\d{3}\b)/g, ""), ",")!);

/** Onde começa a 1.ª coluna depois da descrição, pelo cabeçalho da tabela (a que tem «IVA» e «Valor»). */
function descriptionLimit(rows: PdfRow[]): number | null {
  for (const r of rows) {
    const ts = r.words.map((w) => w.text.toLowerCase());
    if (!ts.includes("iva") || !ts.some((t) => t.startsWith("valor"))) continue;
    const cols = r.words.filter((w) => HEADER_COLUMN.test(w.text)).map((w) => w.x);
    if (cols.length) return Math.min(...cols) - 20;
  }
  return null;
}

function lineOf(r: PdfRow, index: number, descMaxX: number): LayoutLine | null {
  // Rótulos rodados na margem («DETALHE FATURA») não fazem parte da linha.
  const ws = r.words.filter((w) => !w.rotated);
  // Valor a seguir à taxa; ou, se a taxa fecha a linha (só com o código «(c)»), o último valor antes dela.
  const valueOf = (i: number): number => {
    if (MONEY.test(ws[i + 1]?.text ?? "")) return i + 1;
    if (ws.slice(i + 1).some((w) => !CODE.test(w.text))) return -1;
    const before = ws.slice(0, i).findLastIndex((w) => w.text !== "€");
    return before >= 0 && MONEY.test(ws[before]!.text) ? before : -1;
  };
  const at = ws.findIndex((w, i) => w.x > descMaxX && RATE.test(w.text) && valueOf(i) >= 0);
  if (at < 1) return null;
  const rate = RATE.exec(ws[at]!.text)![1]!.replace(",", ".");
  const valueAt = valueOf(at);
  const value = ws[valueAt]!.text;
  const description = ws.filter((w) => w.x <= descMaxX).map((w) => w.text).join(" ").trim();
  if (!description || /^total\b/i.test(description)) return null;
  const before = ws.slice(0, Math.min(at, valueAt)).filter((w) => w.x > descMaxX && !DATE.test(w.text));
  let middle = before;
  let unitPriceText: string | null = null;
  let grossCents = cents(value);
  let lineDiscountCents = 0;
  if (valueAt < at) {
    // «32 dias 0,317400€/dia [0,247572€/dia] 10,16 € -2,23 € 7,93 €»: bruto e desconto antes do valor;
    // só se aceita o desconto se bruto − desconto = valor impresso.
    const firstMoney = before.findIndex((w) => MONEY.test(w.text));
    middle = firstMoney >= 0 ? before.slice(0, firstMoney) : before;
    const amounts = before.slice(Math.max(firstMoney, 0)).filter((w) => MONEY.test(w.text)).map((w) => cents(w.text));
    const discount = -amounts.filter((c) => c < 0).reduce((a, c) => a + c, 0);
    if (amounts.length && amounts[0]! > 0 && discount > 0 && amounts[0]! - discount === grossCents) {
      lineDiscountCents = discount;
      grossCents = amounts[0]!;
    }
    const unit = middle.findLast((w) => UNIT_PRICE.test(w.text));
    unitPriceText = unit ? UNIT_PRICE.exec(unit.text)![1]! : null;
    if (unit) middle = middle.slice(0, middle.indexOf(unit));
  } else {
    const unit = middle.at(-1);
    unitPriceText = unit && NUMBER.test(unit.text) && unit.text.includes(",") ? unit.text : null;
    if (unitPriceText) middle = middle.slice(0, -1);
  }
  // Quantidade: números entre a descrição e o preço; milhares com espaço («1» + «187,00» = «1187,00»)
  // ou com ponto («1.319» = «1319»).
  const nums = middle.filter((w) => NUMBER.test(w.text) || THOUSANDS.test(w.text)).map((w) => w.text.replaceAll(".", ""));
  const quantityText = nums.length > 1 && /^\d{1,3}$/.test(nums[0]!) && /^\d{3}(,\d+)?$/.test(nums[1]!) ? nums[0]! + nums[1]! : (nums[0] ?? "1");
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
    grossCents,
    ...(lineDiscountCents && { lineDiscountCents }),
    vatCode: rate,
    flags: [],
    promoCode: null,
    relatedLineIndex: null,
    notes: [],
    rawText: ws.map((w) => w.text).join(" "),
  };
}

export class RateLinesLayout implements InvoiceLayout {
  readonly id = "layout:rate-lines";
  readonly strict = true;

  detect(content: PdfContent, qr: FiscalQr | null): boolean {
    if (!qr) return false;
    return content.pages.some((p) => {
      const rows = pageRows(p);
      const limit = descriptionLimit(rows);
      return limit !== null && rows.some((r) => lineOf(r, 0, limit) !== null);
    });
  }

  parse(content: PdfContent, qr: FiscalQr | null): LayoutResult {
    const issues: ReadingIssue[] = [];
    const lines: LayoutLine[] = [];
    const discounts: LayoutDiscount[] = [];
    for (const page of content.pages) {
      const rows = pageRows(page);
      const limit = descriptionLimit(rows);
      if (limit === null) continue;
      for (const r of rows) {
        const line = lineOf(r, lines.length, limit);
        // Linha negativa («Desconto de boas-vindas -10,00 € 23%») = desconto do documento nessa taxa.
        if (line && line.grossCents < 0) discounts.push({ page: r.page, description: line.description, amountCents: -line.grossCents, vatCode: line.vatCode, promoCode: null });
        else if (line) lines.push(line);
      }
    }
    if (!lines.length) issues.push({ code: "no_lines", blocking: true, detail: "Nenhuma linha com taxa de IVA encontrada." });
    // Quadro de IVA do documento pelo QR (taxa = código da linha).
    const vatTable: ReadVatRow[] = qr
      ? qrVatRows(qr, [...new Set([...lines, ...discounts].map((l) => l.vatCode!))])
          .filter((v) => v.code !== null)
          .map((v) => ({ code: String(Number(v.rate)), rate: v.rate, baseCents: v.baseCents, vatCents: v.vatCents }))
      : [];
    for (const l of [...lines, ...discounts]) l.vatCode = String(Number(l.vatCode));
    return {
      header: {
        supplierName: null,
        dueDate: ((d) => (d && (!qr?.issueDate || d >= qr.issueDate) ? d : null))(dueDateOf(content)),
        documentNumber: qr?.documentNumber ?? null,
        atcud: qr?.atcud ?? null,
        issuerNif: qr?.issuerNif ?? null,
        buyerNif: qr?.buyerNif ?? null,
        issueDate: qr?.issueDate ?? null,
      },
      lines,
      discounts,
      footer: { discountTotalCents: null, itemCountText: null, depositCountText: null, netTotalCents: null, depositTotalCents: null, vatTable, totalCents: null },
      carried: [],
      issues,
    };
  }
}
