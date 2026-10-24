import { computeDocumentAmounts, distribute } from "../../../../../kernel/money/document-amounts.js";
import { dec, decToString, parseDecimal, pctOfCents, type Dec } from "../../../../../kernel/money/decimal.js";
import type { FiscalQr, InvoiceReading, PdfContent, ReadingIssue, ReadLine } from "../../entities/invoice-reading.js";
import { checkQrTotals, looksLikeAtQr, parseAtQr, qrBands } from "./fiscal-qr.js";
import type { InvoiceLayout, LayoutResult } from "./invoice-layout.js";

/**
 * Leitura determinística: QR fiscal (identidade e totais) → layout do fornecedor
 * (linhas reais do texto nativo) → motor de valores (reconciliação ao cêntimo) →
 * verificações cruzadas. Nunca corrige valores: o que não fecha fica como problema.
 * Sem layout reconhecido devolve `unsupported` (o chamador usa a extração por IA).
 */

const sumDec = (texts: string[]): string => {
  let acc: Dec = { units: 0n, scale: 0 };
  for (const t of texts) {
    const d = parseDecimal(t, ",");
    if (!d) continue;
    const scale = Math.max(acc.scale, d.scale);
    acc = { units: acc.units * 10n ** BigInt(scale - acc.scale) + d.units * 10n ** BigInt(scale - d.scale), scale };
  }
  return decToString(acc);
};
const sameNumber = (a: string, b: string) => {
  const x = parseDecimal(a.replace(".", ","), ","), y = parseDecimal(b.replace(".", ","), ",");
  return !!x && !!y && decToString(x) === decToString(y);
};
const eur = (c: number) => (c / 100).toFixed(2).replace(".", ",");

export function readFiscalQr(content: PdfContent): { qr: FiscalQr | null; issues: ReadingIssue[] } {
  const candidates = content.qrCodes.filter((q) => looksLikeAtQr(q.text));
  if (!candidates.length) return { qr: null, issues: [{ code: "qr_missing", blocking: false, detail: "Sem QR fiscal AT legível; identidade e totais lidos do texto." }] };
  const parsed = parseAtQr(candidates[0]!.text);
  if (!parsed.ok) return { qr: null, issues: [{ code: "qr_invalid", blocking: true, detail: `QR fiscal inválido (${parsed.reason}).` }] };
  const issues: ReadingIssue[] = [];
  let qr = parsed.qr;
  let { taxDiffCents, totalDiffCents } = checkQrTotals(qr);
  // Alguns emissores repetem o total no campo L («não sujeito»): sem esse L tudo fecha → ignora-se o L.
  if (!taxDiffCents && totalDiffCents && qr.notSubjectCents && totalDiffCents + qr.notSubjectCents === 0) {
    qr = { ...qr, notSubjectCents: 0 };
    ({ taxDiffCents, totalDiffCents } = checkQrTotals(qr));
    issues.push({ code: "qr_totals_inconsistent", blocking: false, detail: `QR com o campo L (não sujeito) igual ao total (${eur(parsed.qr.notSubjectCents)} €) — ignorado; bases e IVA do QR fecham com o total.` });
  }
  if (taxDiffCents || totalDiffCents) issues.push({ code: "qr_totals_inconsistent", blocking: true, detail: `QR incoerente: impostos ${eur(taxDiffCents)} €, total ${eur(totalDiffCents)} €.` });
  return { qr, issues };
}

export function readInvoice(content: PdfContent, layouts: InvoiceLayout[]): InvoiceReading {
  const { qr, issues } = readFiscalQr(content);
  const layout = layouts.find((l) => l.detect(content, qr)) ?? null;
  const emptyTotals = { grossCents: 0, discountCents: 0, netCents: 0, vatCents: 0, totalCents: qr?.totalCents ?? null, depositsCents: 0, productUnits: "0", depositUnits: "0" };
  const qrHeader = { supplierName: null, dueDate: null, issuerNif: qr?.issuerNif ?? null, buyerNif: qr?.buyerNif ?? null, documentType: qr?.documentType ?? null, documentNumber: qr?.documentNumber ?? null, atcud: qr?.atcud ?? null, issueDate: qr?.issueDate ?? null };
  if (!layout) {
    issues.push({ code: "layout_unknown", blocking: true, detail: "Layout de fatura sem leitor determinístico." });
    return { layout: null, qr, header: qrHeader, lines: [], vatTable: [], totals: emptyTotals, issues, status: "unsupported" };
  }

  const parsed = layout.parse(content, qr);
  issues.push(...parsed.issues);
  const discountByLine = allocateDiscounts(parsed, issues);

  // Código de IVA do fornecedor → taxa, só a partir do quadro do próprio documento.
  const rateByCode = new Map(parsed.footer.vatTable.map((v) => [v.code, v.rate]));
  const lines: ReadLine[] = parsed.lines.map((l) => {
    const vatRate = l.vatCode !== null ? rateByCode.get(l.vatCode) ?? null : null;
    if (vatRate === null) issues.push({ code: "vat_code_unknown", blocking: true, detail: `${l.supplierCode ?? l.description}: código de IVA «${l.vatCode ?? "—"}» sem taxa no quadro do documento.`, page: l.page, lineIndex: l.index });
    const discountCents = discountByLine.get(l.index) ?? 0;
    return { ...l, vatRate, discountCents, netCents: l.grossCents - discountCents };
  });

  const declaredTotal = qr?.totalCents ?? parsed.footer.totalCents;
  const amounts = computeDocumentAmounts({
    lines: lines.map((l) => ({
      id: String(l.index),
      quantity: parseDecimal(l.quantityText, ",") ?? dec("0"),
      unitPrice: null,
      grossCents: l.grossCents,
      discount: l.discountCents ? { kind: "amount", cents: l.discountCents } : null,
      vatRate: l.vatRate === null ? null : dec(l.vatRate),
    })),
    footerDiscountCents: parsed.footer.discountTotalCents,
    declared: { totalCents: declaredTotal, vatByRate: parsed.footer.vatTable.map((v) => ({ rate: dec(v.rate), baseCents: v.baseCents, vatCents: v.vatCents })) },
  });
  // Emitente que arredonda o IVA linha a linha: só se aceita se o IVA declarado por taxa for
  // EXATAMENTE a soma do IVA de cada linha arredondado — fica como aviso (ajuste de arredondamento).
  const perLine = perLineRoundingExplains(amounts, lines);
  if (perLine) issues.push({ code: "vat_rounded_per_line", blocking: false, detail: `IVA arredondado linha a linha pelo emitente (${eur(perLine)} € face ao cálculo por taxa) — aplicar o ajuste de arredondamento.` });
  if (!amounts.reconciled && perLine === null) {
    const detail = amounts.issues.map((i) => i.code + ("cents" in i ? ` ${eur(i.cents)} €` : "rate" in i ? ` ${i.rate}%: ${eur(i.computedCents)} vs ${eur(i.declaredCents)}` : "")).join("; ");
    issues.push({ code: "amounts_not_reconciled", blocking: true, detail: `Valores não fecham com o documento: ${detail}.` });
  }

  const products = lines.filter((l) => l.kind === "product");
  const deposits = lines.filter((l) => l.kind === "deposit");
  const productUnits = sumDec(products.map((l) => l.quantityText));
  const depositUnits = sumDec(deposits.map((l) => l.quantityText));
  const f = parsed.footer;
  if (f.itemCountText !== null && !sameNumber(f.itemCountText, productUnits)) issues.push({ code: "item_count_mismatch", blocking: true, detail: `Nº de artigos ${f.itemCountText} ≠ soma das quantidades lidas ${productUnits}.` });
  if (f.depositCountText !== null && !sameNumber(f.depositCountText, depositUnits)) issues.push({ code: "deposit_count_mismatch", blocking: true, detail: `Depósitos ${f.depositCountText} ≠ lidos ${depositUnits}.` });
  if (f.netTotalCents !== null && f.netTotalCents !== amounts.netCents) issues.push({ code: "net_total_mismatch", blocking: true, detail: `Total s/ IVA ${eur(f.netTotalCents)} € ≠ linhas ${eur(amounts.netCents)} €.` });
  for (const c of parsed.carried) {
    const upTo = lines.filter((l) => l.index <= c.afterLineIndex);
    const gross = upTo.reduce((a, l) => a + l.grossCents, 0);
    const net = upTo.reduce((a, l) => a + l.netCents, 0);
    if (c.cents !== gross && c.cents !== net) issues.push({ code: "carried_total_mismatch", blocking: true, detail: `Valor transportado ${eur(c.cents)} € ≠ linhas ${eur(gross)} €.`, page: c.page });
  }

  const header = crossCheckHeader(qr, parsed, issues);
  if (qr) crossCheckQrVat(qr, parsed, issues);

  return {
    layout: layout.id,
    qr,
    header,
    lines,
    vatTable: parsed.footer.vatTable,
    totals: {
      grossCents: amounts.grossCents,
      discountCents: amounts.discountCents,
      netCents: amounts.netCents,
      vatCents: amounts.vatCents,
      totalCents: declaredTotal,
      depositsCents: deposits.reduce((a, l) => a + l.netCents, 0),
      productUnits,
      depositUnits,
    },
    issues,
    status: issues.some((i) => i.blocking) ? "needs_attention" : "ready",
  };
}

/** Diferença (cêntimos) explicada por arredondamento do IVA linha a linha; null se não for só isso. */
function perLineRoundingExplains(amounts: ReturnType<typeof computeDocumentAmounts>, lines: ReadLine[]): number | null {
  if (amounts.reconciled) return null;
  if (amounts.issues.some((i) => i.code !== "vat_mismatch" && i.code !== "difference")) return null;
  let delta = 0;
  for (const i of amounts.issues) {
    if (i.code !== "vat_mismatch") continue;
    const sumPerLine = lines.filter((l) => l.vatRate === i.rate).reduce((a, l) => a + pctOfCents(l.netCents, dec(i.rate)), 0);
    if (sumPerLine !== i.declaredCents || Math.abs(i.declaredCents - i.computedCents) > 1 * Math.max(1, lines.length)) return null;
    delta += i.declaredCents - i.computedCents;
  }
  return delta !== 0 && amounts.differenceCents === delta ? delta : null;
}

/** Descontos fora da linha → linha com o mesmo código de promoção (aplicados uma só vez). */
function allocateDiscounts(parsed: LayoutResult, issues: ReadingIssue[]): Map<number, number> {
  const out = new Map<number, number>();
  const add = (idx: number, c: number) => out.set(idx, (out.get(idx) ?? 0) + c);
  for (const l of parsed.lines) if (l.lineDiscountCents) add(l.index, l.lineDiscountCents);
  for (const d of parsed.discounts) {
    let targets = d.promoCode ? parsed.lines.filter((l) => l.promoCode === d.promoCode) : [];
    if (!targets.length) {
      // Sem referência: reparte pelas linhas com o mesmo código de IVA, e assinala.
      targets = parsed.lines.filter((l) => l.kind === "product" && (d.vatCode === null || l.vatCode === d.vatCode));
      issues.push(d.promoCode
        ? { code: "discount_reference_missing", blocking: true, detail: `Desconto ${eur(d.amountCents)} € (MOT ${d.promoCode}) sem artigo com esse código.`, page: d.page }
        : { code: "discount_without_reference", blocking: false, detail: `Desconto ${eur(d.amountCents)} € «${d.description}» sem código de promoção: repartido pelas linhas do IVA ${d.vatCode ?? "—"}.`, page: d.page });
    }
    distribute(d.amountCents, targets.map((l) => l.grossCents)).forEach((c, i) => add(targets[i]!.index, c));
  }
  return out;
}

function crossCheckHeader(qr: FiscalQr | null, parsed: LayoutResult, issues: ReadingIssue[]): InvoiceReading["header"] {
  const h = parsed.header;
  if (qr) {
    const diffs: string[] = [];
    if (h.documentNumber && h.documentNumber.replace(/\s+/g, " ") !== qr.documentNumber) diffs.push(`nº ${h.documentNumber} ≠ ${qr.documentNumber}`);
    if (h.atcud && qr.atcud && h.atcud !== qr.atcud) diffs.push(`ATCUD ${h.atcud} ≠ ${qr.atcud}`);
    if (h.issuerNif && h.issuerNif !== qr.issuerNif) diffs.push(`NIF emitente ${h.issuerNif} ≠ ${qr.issuerNif}`);
    if (h.issueDate && qr.issueDate && h.issueDate !== qr.issueDate) diffs.push(`data ${h.issueDate} ≠ ${qr.issueDate}`);
    if (diffs.length) issues.push({ code: "qr_header_mismatch", blocking: true, detail: `QR diferente do cabeçalho: ${diffs.join("; ")}.` });
  }
  return {
    supplierName: h.supplierName,
    dueDate: h.dueDate ?? null,
    issuerNif: qr?.issuerNif ?? h.issuerNif,
    buyerNif: qr?.buyerNif ?? h.buyerNif,
    documentType: qr?.documentType ?? null,
    documentNumber: qr?.documentNumber ?? h.documentNumber,
    atcud: qr?.atcud ?? h.atcud,
    issueDate: qr?.issueDate ?? h.issueDate,
  };
}

/** Cada linha do quadro de IVA tem de existir no QR (mesma base e IVA) e vice-versa; total igual. */
function crossCheckQrVat(qr: FiscalQr, parsed: LayoutResult, issues: ReadingIssue[]) {
  const bands = qrBands(qr);
  const table = parsed.footer.vatTable;
  const unmatched = table.filter((v) => !bands.some((b) => b.baseCents === v.baseCents && b.vatCents === v.vatCents));
  const missing = bands.filter((b) => !table.some((v) => b.baseCents === v.baseCents && b.vatCents === v.vatCents));
  if (table.length && (unmatched.length || missing.length)) {
    issues.push({ code: "qr_vat_table_mismatch", blocking: true, detail: `Quadro de IVA ≠ QR (${[...unmatched.map((v) => `${v.rate}%: ${eur(v.baseCents)}/${eur(v.vatCents)}`), ...missing.map((b) => `QR ${b.kind}: ${eur(b.baseCents)}/${eur(b.vatCents)}`)].join("; ")}).` });
  }
  if (parsed.footer.totalCents !== null && parsed.footer.totalCents !== qr.totalCents) issues.push({ code: "qr_header_mismatch", blocking: true, detail: `Valor Total ${eur(parsed.footer.totalCents)} € ≠ QR ${eur(qr.totalCents)} €.` });
}
