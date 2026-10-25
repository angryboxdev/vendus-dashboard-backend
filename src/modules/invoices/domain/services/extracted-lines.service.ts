import type { AiExtractedLine } from "../entities/ai-extraction-result.js";

/**
 * Conferência aritmética das linhas devolvidas pela IA: quantidade × preço (menos o desconto da
 * linha) tem de dar o total da linha impresso.
 * - Só fecha dividindo a quantidade (ou o preço) por 10/100/1000 → foi lida com o separador errado
 *   (ex.: «4,000» = 4 lido como 4000). Corrige-se e fica um aviso «para rever» — nunca em silêncio.
 * - Não fecha de todo (ex.: a IA pôs o total da linha no preço unitário — «4 × 190,00» numa linha de
 *   190,00 €) → prevalece o valor impresso da linha: o preço inconsistente é descartado, com aviso.
 * O documento não é alterado; só se rejeita uma interpretação que não fecha.
 */

const TOLERANCE_CENTS = 1;
const SCALES = [1000, 100, 10];

export interface LineSanitizeNote {
  index: number;
  description: string;
  code: "line_unit_price_discarded" | "quantity_scale_corrected" | "unit_price_scale_corrected";
  detail: string;
}

/** Líquido da linha para quantidade × preço com o desconto lido (% ou valor em cêntimos). */
function netOf(q: number, p: number, l: AiExtractedLine): number {
  const gross = q * p;
  const pct = l.discountPct ?? 0;
  const amount = l.discountAmount ?? 0;
  return Math.round(gross - Math.round((gross * pct) / 100) - amount);
}

const fmtQty = (n: number) => n.toLocaleString("pt-PT", { maximumFractionDigits: 6 });

/** Quantidade impressa lida à portuguesa (vírgula decimal, ponto/espaço de milhares): «4,000» = 4. */
function ptQuantity(text: string | null | undefined): number | null {
  if (!text) return null;
  const t = text.replace(/\s/g, "");
  if (!/^\d{1,3}(\.\d{3})*(,\d+)?$|^\d+(,\d+)?$/.test(t)) return null;
  return Number(t.replace(/\./g, "").replace(",", "."));
}
const same = (a: number, b: number) => Math.abs(a - b) < 0.000001;

export function sanitizeExtractedLines(lines: AiExtractedLine[]): { lines: AiExtractedLine[]; notes: LineSanitizeNote[] } {
  const notes: LineSanitizeNote[] = [];
  const out = lines.map((line, index) => {
    let l = line;
    const p = l.unitPriceWithoutVat, t = l.totalWithoutVat;
    if (l.quantity == null || l.quantity <= 0 || p == null || p <= 0 || t == null || t <= 0) return l;
    const hasDiscount = (l.discountPct ?? 0) > 0 || (l.discountAmount ?? 0) > 0;

    // 1. Ordem de grandeza: só fecha com a quantidade (ou o preço) a dividir por 10/100/1000.
    if (Math.abs(netOf(l.quantity, p, l) - t) > TOLERANCE_CENTS + (hasDiscount ? 1 : 0)) {
      const fits = (q: number, price: number) => Math.abs(netOf(q, price, l) - t) <= TOLERANCE_CENTS + (hasDiscount ? 1 : 0);
      // O texto impresso decide quando os dois fecham: «4» confirma a quantidade (o erro está no preço).
      const printed = ptQuantity(l.quantityText);
      const quantityConfirmed = printed !== null && same(printed, l.quantity);
      const qScale = quantityConfirmed ? undefined : SCALES.find((k) => fits(l.quantity! / k, p) && (printed === null || same(printed, l.quantity! / k)));
      if (qScale) {
        const q = l.quantity / qScale;
        notes.push({
          index,
          description: l.description,
          code: "quantity_scale_corrected",
          detail: `«${l.description.slice(0, 60)}»: quantidade lida ${fmtQty(l.quantity)} corrigida para ${fmtQty(q)}${l.quantityText ? ` («${l.quantityText}» com vírgula decimal)` : ""} — só assim fecha com o total da linha. Confirmar.`,
        });
        l = { ...l, quantity: q, ...(l.grossWithoutDiscount != null && { grossWithoutDiscount: Math.round(q * p) }) };
      } else {
        const pScale = SCALES.find((k) => fits(l.quantity!, p / k));
        if (pScale) {
          notes.push({
            index,
            description: l.description,
            code: "unit_price_scale_corrected",
            detail: `«${l.description.slice(0, 60)}»: preço lido ${(p / 100).toFixed(2)} € corrigido para ${(p / pScale / 100).toFixed(4)} € — só assim fecha com o total da linha. Confirmar.`,
          });
          l = { ...l, unitPriceWithoutVat: p / pScale, unitPriceText: null };
        }
      }
    }

    // 2. Conferência normal (com desconto, contra o bruto impresso quando existe).
    const q = l.quantity!, price = l.unitPriceWithoutVat!;
    const target = hasDiscount ? l.grossWithoutDiscount ?? null : t;
    if (target == null) return l;
    if (Math.abs(Math.round(q * price) - target) <= TOLERANCE_CENTS) return l;
    notes.push({
      index,
      description: l.description,
      code: "line_unit_price_discarded",
      detail: `«${l.description.slice(0, 60)}»: ${fmtQty(q)} × ${(price / 100).toFixed(2)} € ≠ ${(target / 100).toFixed(2)} € impressos — usado o total da linha.`,
    });
    return { ...l, unitPriceWithoutVat: null, unitPriceText: null, grossWithoutDiscount: target };
  });
  return { lines: out, notes };
}
