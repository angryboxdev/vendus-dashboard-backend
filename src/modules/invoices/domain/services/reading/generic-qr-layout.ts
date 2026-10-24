import { mulToCents, parseDecimal, toCents, type Dec } from "../../../../../kernel/money/decimal.js";
import type { FiscalQr, PdfContent, ReadingIssue } from "../../entities/invoice-reading.js";
import { checkQrTotals } from "./fiscal-qr.js";
import type { InvoiceLayout, LayoutLine, LayoutResult } from "./invoice-layout.js";
import { pageRows, type PdfRow } from "./pdf-rows.js";
import { qrVatRows, type QrVatRow } from "./qr-rates.js";

/**
 * Leitor genérico para QUALQUER fatura portuguesa com QR fiscal AT (sem IA).
 * - Identidade e totais por taxa vêm do QR; a taxa de cada grupo só é aceite se
 *   base × taxa = IVA do QR (`qrVatRows`).
 * - A tabela é encontrada pelo cabeçalho (Descrição + colunas de valores); as
 *   colunas pelos títulos e posições; a descrição pode ocupar várias linhas.
 * - A coluna do valor líquido de cada linha é a que SOMA EXATAMENTE as bases do
 *   QR por taxa (ex.: «Total s/ IVA» e não «Valor» com IVA) — prova, não palpite.
 * - Estrito: se nada fechar, devolve um problema bloqueante e o chamador usa a IA.
 */

type Role = "code" | "desc" | "qty" | "unit" | "disc" | "rate" | "money" | "text";
interface Label { text: string; x0: number; x1: number; role: Role }
interface Token { text: string; x0: number; x1: number }

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();

function roleOf(text: string): Role {
  const t = norm(text);
  if (/^(DESCRI|DESIGNA|PRODUTO|SERVICO|DESCRIPTION|ITEM|ARTIGO$|ARTIGOS$)/.test(t)) return "desc";
  if (/^(COD|REF|C[OÓ]DIGO|ART\.?$)/.test(t)) return "code";
  if (/^(QT|QUANT|QTY|QNT)/.test(t)) return "qty";
  if (/^(DESC(ONTO)?\.?\s*%?$|DTO|%\s*DESC)/.test(t)) return "disc";
  // «IVA %» / «Taxa IVA» = taxa; «IVA Valor» / «Valor IVA» = montante (coluna de valores).
  const moneyWord = /(TOTAL|VALOR|MONTANTE|IMPORT|LIQUIDO|BASE|SUBTOTAL|INCIDENCIA)/.test(t);
  if (/^(IVA|TAXA|TX\.?\s*IVA|%\s*IVA)/.test(t) && !moneyWord) return "rate";
  if (/(^PREC\b|PRECO|P\.?\s*UNIT|PR\.?\s*UNIT|UNITARIO|V\.?\s*UNIT|PVP)/.test(t)) return "unit";
  if (/(TOTAL|VALOR|MONTANTE|IMPORT|LIQUIDO|BASE|SUBTOTAL|INCIDENCIA)/.test(t)) return "money";
  return "text";
}

/** Palavras próximas no cabeçalho formam um título («Total s/ IVA»). */
function labelsOf(row: PdfRow): Label[] {
  const out: Label[] = [];
  for (const w of row.words) {
    const last = out[out.length - 1];
    if (last && w.x - last.x1 < 6) {
      last.text += ` ${w.text}`;
      last.x1 = w.x + w.width;
    } else out.push({ text: w.text, x0: w.x, x1: w.x + w.width, role: "text" });
  }
  for (const l of out) l.role = roleOf(l.text);
  return out;
}

/**
 * Cabeçalhos em duas linhas («VALOR / SEM IVA», «Total / SI»): palavras da linha logo acima
 * ou logo abaixo (sem valores) juntam-se ao título da mesma coluna.
 */
function mergeHeaderRows(labels: Label[], extra: PdfRow, above: boolean) {
  const targets = extra.words.map((w) => {
    const cx = w.x + w.width / 2;
    let best: Label | null = null, bestD = Infinity;
    for (const l of labels) {
      const d = cx < l.x0 - 12 ? l.x0 - 12 - cx : cx > l.x1 + 12 ? cx - l.x1 - 12 : 0;
      if (d < bestD) { bestD = d; best = l; }
    }
    return bestD <= 16 ? best : null;
  });
  // Só é parte do cabeçalho se TODAS as palavras estiverem sobre/sob um título (senão é outro texto).
  if (targets.some((t) => t === null)) return;
  extra.words.forEach((w, i) => {
    const l = targets[i]!;
    l.text = above ? `${w.text} ${l.text}` : `${l.text} ${w.text}`;
  });
}

function findHeader(rows: PdfRow[]): { row: PdfRow; labels: Label[] } | null {
  for (const [i, row] of rows.entries()) {
    const labels = labelsOf(row);
    const roles = new Set(labels.map((l) => l.role));
    const moneyCols = labels.filter((l) => l.role === "money" || l.role === "unit").length;
    if (!(roles.has("desc") && moneyCols >= 1 && (roles.has("qty") || roles.has("rate") || moneyCols >= 2))) continue;
    const prev = rows[i - 1], next = rows[i + 1];
    const plain = (r: PdfRow) => !r.words.some((w) => MONEY.test(w.text));
    if (prev && prev.page === row.page && prev.y - row.y <= 16 && plain(prev)) mergeHeaderRows(labels, prev, true);
    if (next && next.page === row.page && row.y - next.y <= 14 && plain(next)) mergeHeaderRows(labels, next, false);
    for (const l of labels) l.role = roleOf(l.text);
    const mergedBelow = next && next.page === row.page && row.y - next.y <= 14 && plain(next) && next.words.length > 0 && labels.some((l) => l.text.endsWith(next.words[next.words.length - 1]!.text));
    return { row: mergedBelow ? next : row, labels };
  }
  return null;
}

/** Subtotais e transportes dentro da tabela: não são artigos nem o fim da tabela. */
const SKIP_ROW = /^(SUB-?TOTAL|TRANSPORTE|A TRANSPORTAR|VALOR TRANSPORTADO|VALOR A TRANSPORTAR)/;
const END_OF_TABLE = /^(TOTAL|RESUMO|VALOR TOTAL|TOTAL A PAGAR|BASE TRIBUT|QUADRO|PAGAMENTO|PAGO|MEIOS DE PAGAMENTO|OBSERVA|IBAN|CONDICOES)|TAXA IVA|TOTAL IVA|TOTAL S\.?I\b|TOT\. C\/IVA|RESUMO DO IVA|QUADRO RESUMO/;
// Valores com 2 a 4 casas (alguns emissores imprimem «125,0000»); preços unitários até 9.
const MONEY = /^-?€?\d{1,3}([.\s]\d{3})*,\d{2,4}€?$|^-?€?\d+,\d{2,4}€?$|^-?€?\d{1,3}(,\d{3})*\.\d{2,4}€?$|^-?€?\d+\.\d{2,4}€?$/;
const NUMBER = /^-?\d+([.,]\d{1,9})?$/;
const RATE = /^\d{1,2}([.,]\d{1,2})?\s*%$/;

/** Valor monetário com o separador do próprio texto (vírgula ou ponto decimal). */
function moneyCents(text: string): number | null {
  const t = text.replace(/€/g, "").replace(/\s/g, "");
  const commaDecimal = /,\d{2,4}$/.test(t);
  const d = parseDecimal(t, commaDecimal ? "," : ".");
  return d ? toCents(d) : null;
}
const decOf = (text: string): Dec | null => parseDecimal(text.replace(/\s/g, ""), text.includes(",") ? "," : ".");
const rateOf = (text: string) => {
  const d = decOf(text.replace(/%/g, "").trim());
  return d ? String(Number(d.units) / 10 ** d.scale) : null;
};

/** Tokens de uma linha (palavras; «190,00 €» → um token monetário). */
function tokensOf(row: PdfRow): Token[] {
  const out: Token[] = [];
  for (const w of row.words) {
    const last = out[out.length - 1];
    if (last && w.text === "€" && w.x - last.x1 < 8) {
      last.x1 = w.x + w.width;
      continue;
    }
    out.push({ text: w.text, x0: w.x, x1: w.x + w.width });
  }
  return out;
}

/**
 * Coluna de um token: texto dentro da faixa da descrição (do título dela ao título seguinte) é
 * descrição; o resto vai para o título mais próximo (números alinhados à direita ficam à esquerda).
 */
function columnOf(t: Token, labels: Label[]): Label | null {
  const di = labels.findIndex((l) => l.role === "desc");
  if (di >= 0 && !MONEY.test(t.text) && !RATE.test(t.text)) {
    const start = labels[di]!.x0 - 8;
    const end = labels[di + 1]?.x0 ?? Infinity;
    if (t.x0 >= start && t.x0 < end - 2) return labels[di]!;
  }
  let best: Label | null = null, bestD = Infinity;
  for (const l of labels) {
    const d = t.x1 < l.x0 ? l.x0 - t.x1 : t.x0 > l.x1 ? t.x0 - l.x1 : 0;
    if (d < bestD) { bestD = d; best = l; }
  }
  return bestD <= 45 ? best : null;
}

interface Item {
  page: number;
  y: number;
  cells: Map<Label, string[]>;
  /** Pedaços da descrição com a altura de cada linha (ordenados de cima para baixo no fim). */
  desc: { y: number; text: string }[];
  raw: string;
}

/** Células de um item numa coluna, pelo título (cada página tem o seu cabeçalho). */
function cellsOf(it: Item, l: Label): string[] | undefined {
  const key = norm(l.text);
  for (const [k, v] of it.cells) if (norm(k.text) === key) return v;
  return undefined;
}

/** Nome do emitente: linha com o NIF do QR (ou a anterior), até à forma jurídica. */
function supplierNameOf(rows: PdfRow[], nif: string): string | null {
  for (let i = 0; i < rows.length; i++) {
    if (!rows[i]!.text.replace(/\D/g, "").includes(nif)) continue;
    for (const r of [rows[i]!, rows[i - 1]].filter(Boolean) as PdfRow[]) {
      const m = /([A-ZÀ-Ú0-9][\wÀ-ú&.,'\- ]{2,}?\b(?:UNIPESSOAL,?\s+LDA|LDA|S\.?\s?A|LIMITADA))\.?/i.exec(r.text);
      if (m) return m[1]!.trim();
    }
  }
  return null;
}

const DATE = /^(\d{2})\s*[/.-]\s*(\d{2})\s*[/.-]\s*(\d{4})$|^(\d{4})-(\d{2})-(\d{2})$/;
const isoOf = (text: string) => {
  const m = DATE.exec(text.trim());
  if (!m) return null;
  return m[1] ? `${m[3]}-${m[2]}-${m[1]}` : `${m[4]}-${m[5]}-${m[6]}`;
};

/** Vencimento impresso: data a seguir ao rótulo na mesma linha, ou logo por baixo dele. */
function dueDateOf(rows: PdfRow[]): string | null {
  for (const r of rows) {
    const t = norm(r.text);
    const m = /(DATA\s+DE\s+VENCIMENTO|D\.\s*VENCIMENTO|VENCIMENTO|DATA\s+LIMITE(\s+DE\s+PAGAMENTO)?|DUE\s+DATE)/.exec(t);
    if (!m) continue;
    const after = t.slice(m.index + m[0].length).replace(/^[\s:]+/, "");
    const inline = isoOf(after.split(/\s{2,}|\s(?=[A-Z])/)[0] ?? "") ?? isoOf(after.slice(0, 14));
    if (inline) return inline;
    let offset = 0;
    const lx = (r.words.find((w) => (offset += w.text.length + 1) > m.index) ?? r.words[0]!).x;
    for (const b of rows) {
      if (b.page !== r.page || b.y >= r.y || r.y - b.y > 45) continue;
      // Datas partidas em palavras («22 / 10 / 2026») ou inteiras.
      const near = b.words.filter((w) => w.x >= lx - 40 && w.x <= lx + 90).map((w) => w.text).join(" ");
      const d = isoOf(near.match(/\d{2}\s*[/.-]\s*\d{2}\s*[/.-]\s*\d{4}|\d{4}-\d{2}-\d{2}/)?.[0] ?? "");
      if (d) return d;
    }
  }
  return null;
}

export class GenericQrLayout implements InvoiceLayout {
  readonly id = "layout:generic-qr";
  readonly strict = true;

  detect(content: PdfContent, qr: FiscalQr | null): boolean {
    if (!qr) return false;
    const { taxDiffCents, totalDiffCents } = checkQrTotals(qr);
    if (taxDiffCents || totalDiffCents) return false;
    return content.pages.some((p) => findHeader(pageRows(p)) !== null);
  }

  parse(content: PdfContent, qr: FiscalQr | null): LayoutResult {
    const issues: ReadingIssue[] = [];
    const allRows = content.pages.flatMap((p) => pageRows(p));
    const result: LayoutResult = {
      header: { supplierName: qr ? supplierNameOf(allRows, qr.issuerNif) : null, dueDate: dueDateOf(allRows), documentNumber: null, atcud: null, issuerNif: null, buyerNif: null, issueDate: null },
      lines: [],
      discounts: [],
      footer: { discountTotalCents: null, itemCountText: null, depositCountText: null, netTotalCents: null, depositTotalCents: null, vatTable: [], totalCents: qr?.totalCents ?? null },
      carried: [],
      issues,
    };
    if (!qr) return fail(result, "Sem QR fiscal.");

    // 1. Itens: linhas com valores (âncoras) + linhas só de texto agarradas à âncora mais próxima.
    const items: Item[] = [];
    const seenTables = new Set<string>();
    let labels: Label[] = [];
    for (const page of content.pages) {
      const rows = pageRows(page);
      const head = findHeader(rows);
      if (!head) continue;
      labels = head.labels;
      // Fim da tabela: primeira linha de totais/pagamentos; as linhas coladas a ela (± 4 pt,
      // ex.: «190,00 € 43,70 €» ao lado de «TOTAL:») também são totais, não artigos.
      const below = rows.filter((r) => r.y < head.row.y - 1);
      const end = below.find((r) => END_OF_TABLE.test(norm(r.text)) || /\bTOTAL\s*:/.test(norm(r.text)));
      const region = below.filter((r) => !end || r.y > end.y + 4);
      const anchors: Item[] = [];
      const textRows: { row: PdfRow; desc: string }[] = [];
      for (const r of region) {
        if (SKIP_ROW.test(norm(r.text))) continue;
        const cells = new Map<Label, string[]>();
        for (const t of tokensOf(r)) {
          const col = columnOf(t, labels);
          if (col) cells.set(col, [...(cells.get(col) ?? []), t.text]);
        }
        const hasMoney = [...cells].some(([l, v]) => (l.role === "money" || l.role === "unit") && v.some((x) => MONEY.test(x)));
        const desc = [...cells].filter(([l]) => l.role === "desc").flatMap(([, v]) => v).join(" ");
        const hasQty = [...cells].some(([l, v]) => l.role === "qty" && v.some((x) => NUMBER.test(x)));
        // Artigo = valores + (descrição ou quantidade); valores soltos são resumos/totais.
        if (hasMoney && (desc || hasQty)) anchors.push({ page: page.number, y: r.y, cells, desc: desc ? [{ y: r.y, text: desc }] : [], raw: r.text });
        else if (desc) textRows.push({ row: r, desc });
      }
      for (const tr of textRows) {
        const near = anchors.reduce<Item | null>((b, a) => (!b || Math.abs(a.y - tr.row.y) < Math.abs(b.y - tr.row.y) ? a : b), null);
        if (near) near.desc.push({ y: tr.row.y, text: tr.desc });
      }
      for (const a of anchors) a.desc.sort((p, q) => q.y - p.y);
      // Cópias da mesma fatura no PDF (ORIGINAL / DUPLICADO / TRIPLICADO): a mesma tabela não se soma duas vezes.
      const signature = anchors.map((a) => a.raw).join("\n");
      if (signature && seenTables.has(signature)) continue;
      seenTables.add(signature);
      items.push(...anchors);
    }
    if (!items.length) return fail(result, "Tabela de artigos não encontrada.");

    // 2. Taxa de IVA de cada linha (coluna IVA, ou o único grupo do QR) e quadro de IVA do QR.
    const rateCol = labels.find((l) => l.role === "rate");
    const hints = items.flatMap((it) => (rateCol ? cellsOf(it, rateCol) ?? [] : [])).map((t) => rateOf(t)).filter((r): r is string => !!r);
    const vat: QrVatRow[] = qrVatRows(qr, hints);
    if (vat.some((v) => v.code === null)) return fail(result, "Taxa de IVA de um grupo do QR não identificável.");
    result.footer.vatTable = vat.map(({ code, rate, baseCents, vatCents }) => ({ code, rate, baseCents, vatCents }));
    const rates = [...new Set(vat.map((v) => v.rate))];
    const rowRate = (it: Item): string | null => {
      const printed = rateCol ? (cellsOf(it, rateCol) ?? []).map((t) => rateOf(t)).find((r) => r !== null) ?? null : null;
      if (printed !== null) return rates.includes(printed) ? printed : null;
      return rates.length === 1 ? rates[0]! : null;
    };
    const itemRates = items.map(rowRate);
    if (itemRates.some((r) => r === null)) return fail(result, "Linha sem taxa de IVA compatível com o QR.");

    // 3. Coluna do valor líquido: a que soma exatamente as bases do QR por taxa.
    const cell = (it: Item, l: Label | undefined) => (l ? (cellsOf(it, l) ?? []).find((x) => MONEY.test(x) || NUMBER.test(x)) ?? null : null);
    const moneyLabels = labels.filter((l) => l.role === "money").sort((a, b) => Number(/S\/?\s*IVA|LIQ|BASE|INCID/.test(norm(b.text))) - Number(/S\/?\s*IVA|LIQ|BASE|INCID/.test(norm(a.text))));
    const qtyCol = labels.find((l) => l.role === "qty");
    const unitCol = labels.find((l) => l.role === "unit");
    const discCol = labels.find((l) => l.role === "disc");
    const sumsMatch = (nets: (number | null)[]) => {
      if (nets.some((n) => n === null)) return false;
      const by = new Map<string, number>();
      nets.forEach((n, i) => by.set(itemRates[i]!, (by.get(itemRates[i]!) ?? 0) + n!));
      return vat.every((v) => (by.get(v.rate) ?? 0) === v.baseCents) && [...by.keys()].every((r) => vat.some((v) => v.rate === r));
    };
    let nets: number[] | null = null;
    for (const l of moneyLabels) {
      const candidate = items.map((it) => { const t = cell(it, l); return t ? moneyCents(t) : null; });
      if (sumsMatch(candidate)) { nets = candidate as number[]; break; }
    }
    if (!nets && qtyCol && unitCol) {
      // Sem coluna que feche: quantidade × preço (sem desconto) por linha.
      const candidate = items.map((it) => {
        const q = cell(it, qtyCol), u = cell(it, unitCol);
        const qd = q ? decOf(q) : null, ud = u ? decOf(u.replace(/€/g, "")) : null;
        return qd && ud ? mulToCents(qd, ud) : null;
      });
      if (sumsMatch(candidate)) nets = candidate as number[];
    }
    if (!nets) return fail(result, "Nenhuma coluna de valores das linhas soma as bases do QR por taxa.");

    // 4. Linhas: quantidade e preço só quando batem com o líquido (com desconto da linha, se houver).
    items.forEach((it, i) => {
      const net = nets![i]!;
      const description = it.desc.map((d) => d.text).join(" ").replace(/\s+/g, " ").trim();
      // Linha negativa (ex.: «Desconto comercial»): desconto das linhas da mesma taxa, não um artigo.
      if (net < 0) {
        result.discounts.push({ page: it.page, description: description || "Desconto", amountCents: -net, vatCode: itemRates[i]!, promoCode: null });
        return;
      }
      const index = result.lines.length;
      const qText = cell(it, qtyCol);
      const uText = cell(it, unitCol)?.replace(/€/g, "") ?? null;
      const dText = discCol ? (cellsOf(it, discCol) ?? [])[0] ?? null : null;
      const q = qText ? decOf(qText) : null;
      const u = uText ? decOf(uText) : null;
      let gross = net, unitPriceText: string | null = null, lineDiscount = 0;
      if (q && u) {
        const g = mulToCents(q, u);
        if (Math.abs(g - net) <= 1) { gross = net; unitPriceText = uText; }
        else if (dText && g > net) { gross = g; lineDiscount = g - net; unitPriceText = uText; }
      }
      const code = labels.find((l) => l.role === "code");
      const line: LayoutLine = {
        index,
        page: it.page,
        kind: "product",
        supplierCode: code ? (cellsOf(it, code) ?? [])[0] ?? null : null,
        description: description || "(sem descrição)",
        pack: null,
        basePriceText: null,
        factorText: null,
        unitPriceText,
        quantityText: q ? qText! : "1",
        grossCents: gross,
        vatCode: itemRates[i]!,
        flags: [],
        promoCode: null,
        relatedLineIndex: null,
        notes: [],
        rawText: it.raw,
        ...(lineDiscount > 0 && { lineDiscountCents: lineDiscount }),
      };
      result.lines.push(line);
    });
    return result;
  }
}

function fail(result: LayoutResult, detail: string): LayoutResult {
  result.lines = [];
  result.issues.push({ code: "no_lines", blocking: true, detail });
  return result;
}
