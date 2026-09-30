export type ConfidenceLevel = "alta" | "media" | "baixa";

export interface ConfidenceSignals {
  /** Dias de histórico disponíveis para esta fonte de procura. */
  historyDaysAvailable: number;
  /** WAPE do backtest mais recente; `null` quando ainda não há backtest possível. */
  backtestWape: number | null;
  /** `true` quando o item foi vendido sem ficha técnica/mapeamento — nunca inventa consumo (secção 18). */
  hasIncompleteMapping: boolean;
  /** `true` quando há "compras por rever" pendentes relevantes para este item (secção 9 — nunca somadas ao stock, só reduzem confiança). */
  pendingReviewsAffectingItem: boolean;
  /** `true` quando o item tem stock negativo/corrompido (secção 89 — sinal de qualidade, nunca altera o stock em si). */
  hasNegativeOrStaleStock: boolean;
  /** `null` = nunca contado fisicamente. */
  daysSinceLastPhysicalCount: number | null;
}

/**
 * Combina sinais de maturidade/qualidade de dados numa confiança de 3
 * níveis — nunca uma percentagem fabricada (secção 88, "no false
 * precision"). Cold start (secção 24) é resolvido aqui: pouco histórico →
 * pontuação baixa → "baixa" automaticamente, sem uma tabela/flag de
 * "nível" separada.
 *
 * Pontuação começa em 4 (melhor caso) e é penalizada por cada sinal
 * desfavorável; os cortes (`>=3` alta, `==2` média, `<=1` baixa) e os
 * limiares de cada penalização são uma escolha determinística documentada
 * no README (Design decisions) — não vêm da task (que não especifica a
 * fórmula exata), mas seguem a orientação de nunca inflacionar confiança
 * quando falta informação.
 */
export function computeConfidence(signals: ConfidenceSignals): ConfidenceLevel {
  let score = 4;

  if (signals.historyDaysAvailable < 14) score -= 2;
  else if (signals.historyDaysAvailable < 28) score -= 1;

  if (signals.backtestWape == null) score -= 1;
  else if (signals.backtestWape > 0.5) score -= 2;
  else if (signals.backtestWape > 0.25) score -= 1;

  if (signals.hasIncompleteMapping) score -= 2;
  if (signals.pendingReviewsAffectingItem) score -= 1;
  if (signals.hasNegativeOrStaleStock) score -= 1;
  if (signals.daysSinceLastPhysicalCount == null) score -= 2;
  else if (signals.daysSinceLastPhysicalCount > 60) score -= 1;

  if (score >= 3) return "alta";
  if (score >= 2) return "media";
  return "baixa";
}
