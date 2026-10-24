import type { AiExtractedLine } from "../entities/ai-extraction-result.js";

/**
 * Conferência aritmética das linhas devolvidas pela IA: quantidade × preço tem
 * de dar o total da linha impresso. Quando não dá (ex.: a IA pôs o total da linha
 * no preço unitário — «4 × 190,00» numa linha de 190,00 €), prevalece o valor
 * impresso da linha: o preço inconsistente é descartado e fica um aviso. O
 * documento não é alterado; só se rejeita uma interpretação que não fecha.
 */

const TOLERANCE_CENTS = 1;

export interface LineSanitizeNote {
  index: number;
  description: string;
  detail: string;
}

export function sanitizeExtractedLines(lines: AiExtractedLine[]): { lines: AiExtractedLine[]; notes: LineSanitizeNote[] } {
  const notes: LineSanitizeNote[] = [];
  const out = lines.map((l, index) => {
    const q = l.quantity, p = l.unitPriceWithoutVat, t = l.totalWithoutVat;
    if (q == null || q <= 0 || p == null || t == null || t <= 0) return l;
    const hasDiscount = (l.discountPct ?? 0) > 0 || (l.discountAmount ?? 0) > 0;
    // Com desconto, compara-se com o bruto impresso (antes do desconto), quando existe.
    const target = hasDiscount ? l.grossWithoutDiscount ?? null : t;
    if (target == null) return l;
    const computed = Math.round(q * p);
    if (Math.abs(computed - target) <= TOLERANCE_CENTS) return l;
    notes.push({
      index,
      description: l.description,
      detail: `«${l.description.slice(0, 60)}»: ${q} × ${(p / 100).toFixed(2)} € ≠ ${(target / 100).toFixed(2)} € impressos — usado o total da linha.`,
    });
    return { ...l, unitPriceWithoutVat: null, unitPriceText: null, grossWithoutDiscount: target };
  });
  return { lines: out, notes };
}
