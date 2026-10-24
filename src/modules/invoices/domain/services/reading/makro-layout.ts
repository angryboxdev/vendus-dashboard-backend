import { mulToCents, parseDecimal, toCents } from "../../../../../kernel/money/decimal.js";
import type { FiscalQr, PdfContent, ReadingIssue, ReadVatRow } from "../../entities/invoice-reading.js";
import type { InvoiceLayout, LayoutDiscount, LayoutLine, LayoutResult } from "./invoice-layout.js";
import { pageRows, PT_NUMBER, type PdfRow } from "./pdf-rows.js";

/**
 * Layout Makro Portugal (fatura «invoice_copy_main»): tabela
 * `M Código Artigo | Descrição | PACK | PR Unit/KG | Unit/KG | Preço U.V. | Quant | Val.total | IVA | DD | DP | MOT`.
 *
 * - Colunas da esquerda (código, descrição, PACK) e o IVA pela posição do cabeçalho;
 *   as colunas finais pelo significado (letra = indicador, 4–6 dígitos = promoção),
 *   porque o código MOT nem sempre fica alinhado com o cabeçalho.
 * - Linhas «+ … DEPOSITO» são cauções ligadas ao artigo anterior; «+ … a * b = c» (IEC)
 *   são anotações de imposto já incluído no preço — nunca somadas.
 * - «Leve Mais Pague Menos <valor> <IVA> <MOT>» é o desconto do artigo com esse MOT;
 *   «Desconto Total» é só o resumo.
 * - O quadro de IVA do rodapé dá o código → taxa (`2=23,00%`); nada é presumido.
 */

const MAKRO_NIF = "502030712";
const MONEY = /^-?\d{1,3}(\.\d{3})*,\d{2}$|^-?\d+,\d{2}$/;

const centsOf = (text: string): number | null => {
  const d = parseDecimal(text, ",");
  return d ? toCents(d) : null;
};

interface Columns {
  desc: number;
  pack: number;
  vat: number;
}

function findHeader(rows: PdfRow[]): { row: PdfRow; cols: Columns } | null {
  for (const row of rows) {
    const at = (re: RegExp) => row.words.find((w) => re.test(w.text))?.x;
    const desc = at(/^Descri[cç][aã]o/i);
    const pack = at(/^PACK$/i);
    const vat = at(/^Iva/i);
    if (desc !== undefined && pack !== undefined && vat !== undefined && /C[oó]digo/i.test(row.text)) return { row, cols: { desc, pack, vat } };
  }
  return null;
}

const isFooterStart = (r: PdfRow) => /^N[ºo°]\s*de\s*artigos/i.test(r.text);

export class MakroLayout implements InvoiceLayout {
  readonly id = "layout:makro";

  detect(content: PdfContent, qr: FiscalQr | null): boolean {
    const first = content.pages[0];
    if (!first) return false;
    const rows = pageRows(first);
    const isMakro = qr?.issuerNif === MAKRO_NIF || rows.some((r) => /MAKRO CASH & CARRY/i.test(r.text));
    return isMakro && findHeader(rows) !== null;
  }

  parse(content: PdfContent): LayoutResult {
    const issues: ReadingIssue[] = [];
    const lines: LayoutLine[] = [];
    const discounts: LayoutDiscount[] = [];
    const carried: LayoutResult["carried"] = [];
    const footer: LayoutResult["footer"] = { discountTotalCents: null, itemCountText: null, depositCountText: null, netTotalCents: null, depositTotalCents: null, vatTable: [], totalCents: null };
    const header: LayoutResult["header"] = { documentNumber: null, atcud: null, issuerNif: null, buyerNif: null, issueDate: null };
    let inFooter = false;
    let lastProduct: number | null = null;
    let pendingDepositTotal = false;
    let cols: Columns | null = null;

    for (const page of content.pages) {
      const rows = pageRows(page);
      for (const r of rows) this.readHeaderRow(r, header);
      const head = findHeader(rows);
      if (head) cols = head.cols;
      // Página de continuação sem cabeçalho da tabela: a tabela continua abaixo do bloco do cliente.
      const tableTop = head?.row.y ?? (cols ? rows.filter((r) => /N[ºo°]\s*cliente/i.test(r.text)).at(-1)?.y ?? null : null);

      for (const r of rows) {
        if (!inFooter && isFooterStart(r)) inFooter = true;
        if (inFooter) {
          pendingDepositTotal = this.readFooterRow(r, footer, pendingDepositTotal);
          continue;
        }
        if (!cols || tableTop === null || r.y >= tableTop - 1) continue;
        const text = r.text.trim();
        if (!text || /^-+$/.test(text) || text.startsWith("***") || /^Local de descarga/i.test(text)) continue;

        const carriedMatch = /Valor\s+(a\s+transportar|transportado)\b.*?(\S+)$/i.exec(text);
        if (carriedMatch) {
          const c = centsOf(carriedMatch[2]!);
          if (c !== null) carried.push({ page: page.number, cents: c, afterLineIndex: lines.length - 1 });
          continue;
        }
        const total = /^Desconto Total\s+(\S+)$/i.exec(text);
        if (total) {
          footer.discountTotalCents = centsOf(total[1]!);
          continue;
        }
        // Anotação de imposto incluído (IEC): «+ 95 TAXA IEC … 0,304 * 1 = 0,30».
        if (/\*\s*\S+\s*=\s*\S+$/.test(text)) {
          if (lastProduct !== null) lines[lastProduct]!.notes.push(text.replace(/^\+\s*/, ""));
          continue;
        }
        const line = this.readItemRow(r, cols, page.number, lines.length, lastProduct, issues);
        if (line) {
          lines.push(line);
          if (line.kind === "product") lastProduct = line.index;
          continue;
        }
        // Desconto fora da linha: «Leve Mais Pague Menos 0,45 2 53005» ou só «1,87 4 02146».
        const disc = /^(?:(\D.*?)\s+)?(-?[\d.]*\d,\d{2})\s+(\d{1,2})(?:\s+(\d{4,6}))?$/.exec(text);
        if (disc && (disc[1] || disc[4])) {
          discounts.push({ page: page.number, description: disc[1]?.trim() ?? "", amountCents: Math.abs(centsOf(disc[2]!) ?? 0), vatCode: disc[3]!, promoCode: disc[4] ?? null });
          continue;
        }
        if (r.words.some((w) => MONEY.test(w.text))) issues.push({ code: "unrecognized_row", blocking: true, detail: text, page: page.number });
      }
    }
    if (!lines.length) issues.push({ code: "no_lines", blocking: true, detail: "Nenhuma linha de artigo encontrada na tabela." });
    return { header, lines, discounts, footer, carried, issues };
  }

  private readHeaderRow(r: PdfRow, h: LayoutResult["header"]) {
    const t = r.text;
    h.documentNumber ??= /Fa(?:c)?tura\s+N[ºo°]\s*:?\s*(.+?)\s*$/i.exec(t)?.[1] ?? null;
    h.atcud ??= /ATCUD:\s*(\S+)/i.exec(t)?.[1] ?? null;
    h.issuerNif ??= /N[ºo°]\s*Contribuinte:\s*(\d{9})/i.exec(t)?.[1] ?? null;
    h.buyerNif ??= /N\.I\.F\.\s*do\s*Cliente\s*:\s*(?:[A-Z]{2})?(\d{9})/i.exec(t)?.[1] ?? null;
    const d = /Data da venda\s+(\d{2})-(\d{2})-(\d{4})/i.exec(t);
    if (d && !h.issueDate) h.issueDate = `${d[3]}-${d[2]}-${d[1]}`;
  }

  /** Linha de artigo ou depósito; null quando a linha não tem essa estrutura. */
  private readItemRow(r: PdfRow, cols: Columns, page: number, index: number, lastProduct: number | null, issues: ReadingIssue[]): LayoutLine | null {
    const prefix = r.words.filter((w) => w.x < cols.desc - 2);
    const desc = r.words.filter((w) => w.x >= cols.desc - 2 && w.x < cols.pack - 4);
    const tail = r.words.filter((w) => w.x >= cols.pack - 4);
    const markers = prefix.filter((w) => /^(M\*?|\+|\*)$/.test(w.text)).map((w) => w.text);
    const code = prefix.find((w) => /^[0-9A-Z]{3,20}$/.test(w.text) && /\d/.test(w.text))?.text ?? null;
    if (!code || !desc.length) return null;

    const beforeVat = tail.filter((w) => w.x < cols.vat - 3);
    const vatWord = tail.find((w) => Math.abs(w.x - cols.vat) <= 6 && /^\d{1,2}$/.test(w.text));
    const after = tail.filter((w) => w !== vatWord && w.x >= cols.vat - 3);
    const pack = beforeVat[0] && /^[A-Z]{1,4}$/.test(beforeVat[0].text) ? beforeVat[0].text : null;
    const nums = beforeVat.slice(pack ? 1 : 0).map((w) => w.text);
    if (nums.length < 3 || !nums.every((n) => PT_NUMBER.test(n))) return null;

    const [unitPriceText, quantityText, totalText] = nums.slice(-3) as [string, string, string];
    const [basePriceText, factorText] = nums.length >= 5 ? [nums[0]!, nums[1]!] : [null, null];
    const grossCents = centsOf(totalText) ?? 0;
    const unitPrice = parseDecimal(unitPriceText, ",");
    const quantity = parseDecimal(quantityText, ",");
    if (unitPrice && quantity && mulToCents(quantity, unitPrice) !== grossCents) {
      issues.push({ code: "line_total_mismatch", blocking: true, detail: `${code}: ${quantityText} × ${unitPriceText} ≠ ${totalText}`, page, lineIndex: index });
    }
    const flags = after.filter((w) => /^[A-Z]$/.test(w.text)).map((w) => w.text);
    const promoCode = after.find((w) => /^\d{4,6}$/.test(w.text))?.text ?? null;
    const description = desc.map((w) => w.text).join(" ");
    const isDeposit = /^DEP[OÓ]SITO\b|VASILHAME|^TARA\b/i.test(description) || (markers.includes("+") && flags.includes("D"));
    return {
      index,
      page,
      kind: isDeposit ? "deposit" : "product",
      supplierCode: code,
      description,
      pack,
      basePriceText,
      factorText,
      unitPriceText,
      quantityText,
      grossCents,
      vatCode: vatWord?.text ?? null,
      flags,
      promoCode,
      relatedLineIndex: isDeposit ? lastProduct : null,
      notes: [],
      rawText: r.text,
    };
  }

  /** Devolve true quando o valor do total de depósitos vem na linha seguinte. */
  private readFooterRow(r: PdfRow, f: LayoutResult["footer"], pendingDepositTotal: boolean): boolean {
    const t = r.text.trim();
    if (pendingDepositTotal && MONEY.test(t)) {
      f.depositTotalCents = centsOf(t);
      return false;
    }
    if (/^_?TOTAL_?\s*DEP[OÓ]SITO$/i.test(t)) return true;
    f.itemCountText ??= /N[ºo°]\s*de\s*artigos:\s*([\d.,]+)/i.exec(t)?.[1] ?? null;
    const depCount = /Dep[oó]sito:\s*([\d.,]+)/i.exec(t);
    if (depCount && f.depositCountText === null) f.depositCountText = depCount[1]!;
    const net = /Total s\/\s*IVA:\s*(\S+)/i.exec(t);
    if (net) f.netTotalCents = centsOf(net[1]!);
    const dep = /^Total Dep[oó]sito:?\s*(\S+)$/i.exec(t);
    if (dep) f.depositTotalCents = centsOf(dep[1]!);
    const vat = /^(\S+)\s+(\d{1,2})\s*=\s*(\d+(?:,\d+)?)\s*%\s+(\S+)$/.exec(t);
    if (vat && MONEY.test(vat[1]!) && MONEY.test(vat[4]!)) {
      const row: ReadVatRow = { code: vat[2]!, rate: normalizeRate(vat[3]!), baseCents: centsOf(vat[1]!) ?? 0, vatCents: centsOf(vat[4]!) ?? 0 };
      if (!f.vatTable.some((v) => v.code === row.code)) f.vatTable.push(row);
    }
    const total = /^Valor Total\s+(\S+)$/i.exec(t);
    if (total && f.totalCents === null) f.totalCents = centsOf(total[1]!);
    return false;
  }
}

/** "23,00" → "23"; "6,50" → "6.5" (forma canónica da taxa). */
export function normalizeRate(text: string): string {
  const s = text.replace(",", ".");
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
}
