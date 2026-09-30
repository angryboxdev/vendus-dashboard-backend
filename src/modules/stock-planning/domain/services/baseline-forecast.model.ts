import { round6 } from "./numeric.js";

export interface DailyActual {
  /** YYYY-MM-DD */
  date: string;
  quantity: number;
}

export interface DailyPrediction {
  /** YYYY-MM-DD */
  date: string;
  predictedQuantity: number;
  /** Nº de pontos históricos usados para este dia-da-semana — sinal de maturidade para `confidence.service.ts` (secção 24, cold start). */
  pointsUsed: number;
}

export interface ForecastModelInput {
  history: DailyActual[];
  horizonDays: number;
  /** YYYY-MM-DD — primeiro dia do horizonte. */
  horizonStartDate: string;
}

/**
 * Abstração desacoplada da UI (secção 19) — qualquer modelo futuro (nunca
 * um LLM para o número em si, secção 20) implementa isto.
 * `WeekdaySeasonalBaselineModel` é o único modelo construído nesta ronda
 * (obrigatório, secção 21); a arquitetura fica pronta para um `ModelSelector`
 * escolher entre vários por desempenho de backtest (secção 23), mas isso
 * não é implementado agora (ver README).
 */
export interface ForecastModel {
  readonly name: string;
  readonly version: string;
  predict(input: ForecastModelInput): DailyPrediction[];
}

function parseDateUTC(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function toISODate(d: Date): string {
  const iso = d.toISOString();
  return iso.slice(0, 10);
}

function weekdayOf(iso: string): number {
  return parseDateUTC(iso).getUTCDay();
}

/** Peso maior para semanas mais recentes (decaimento exponencial simples, base 0.85 por semana de distância). */
function weekWeight(weeksAgo: number): number {
  return Math.pow(0.85, weeksAgo);
}

interface WeekdayStat {
  weightedSum: number;
  weightSum: number;
  count: number;
}

/**
 * Modelo baseline determinístico e sem I/O (testável isoladamente): média
 * ponderada por dia-da-semana das últimas semanas + um termo de tendência
 * leve. Histórico vazio ou pouco histórico nunca produz `NaN`/negativos —
 * cai para 0 (cold start é resolvido pela confiança, não por um modelo
 * diferente, ver README/`confidence.service.ts`).
 */
export class WeekdaySeasonalBaselineModel implements ForecastModel {
  readonly name = "weekday_seasonal_baseline";
  readonly version = "1.0.0";

  predict(input: ForecastModelInput): DailyPrediction[] {
    const { history, horizonDays, horizonStartDate } = input;
    const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
    const predictions: DailyPrediction[] = [];

    if (sorted.length === 0 || horizonDays <= 0) {
      const start = parseDateUTC(horizonStartDate);
      for (let i = 0; i < Math.max(0, horizonDays); i++) {
        const d = new Date(start);
        d.setUTCDate(d.getUTCDate() + i);
        predictions.push({ date: toISODate(d), predictedQuantity: 0, pointsUsed: 0 });
      }
      return predictions;
    }

    const mostRecentDate = parseDateUTC(sorted[sorted.length - 1]!.date);
    const byWeekday = new Map<number, WeekdayStat>();
    let overallWeightedSum = 0;
    let overallWeightSum = 0;

    for (const point of sorted) {
      const pointDate = parseDateUTC(point.date);
      const daysAgo = Math.max(0, Math.round((mostRecentDate.getTime() - pointDate.getTime()) / 86_400_000));
      const weeksAgo = Math.floor(daysAgo / 7);
      const weight = weekWeight(weeksAgo);
      const weekday = weekdayOf(point.date);
      const stat = byWeekday.get(weekday) ?? { weightedSum: 0, weightSum: 0, count: 0 };
      stat.weightedSum += point.quantity * weight;
      stat.weightSum += weight;
      stat.count += 1;
      byWeekday.set(weekday, stat);
      overallWeightedSum += point.quantity * weight;
      overallWeightSum += weight;
    }

    const overallAverage = overallWeightSum > 0 ? overallWeightedSum / overallWeightSum : 0;
    const trend = this.computeTrendMultiplier(sorted);

    const start = parseDateUTC(horizonStartDate);
    for (let i = 0; i < horizonDays; i++) {
      const d = new Date(start);
      d.setUTCDate(d.getUTCDate() + i);
      const weekday = d.getUTCDay();
      const stat = byWeekday.get(weekday);
      const base = stat && stat.weightSum > 0 ? stat.weightedSum / stat.weightSum : overallAverage;
      const predicted = Math.max(0, base * trend);
      predictions.push({ date: toISODate(d), predictedQuantity: round6(predicted), pointsUsed: stat?.count ?? 0 });
    }

    return predictions;
  }

  /**
   * Termo de tendência leve: compara a média diária das últimas 2 semanas
   * com a das 2 semanas anteriores, limitado a [0.7, 1.3] para nunca
   * amplificar ruído (secção 21 — "tendência simples", nunca um 2º modelo).
   */
  private computeTrendMultiplier(sorted: DailyActual[]): number {
    if (sorted.length < 14) return 1;
    const last14 = sorted.slice(-14);
    const prior14 = sorted.slice(-28, -14);
    if (prior14.length < 7) return 1;
    const avg = (points: DailyActual[]): number => points.reduce((sum, p) => sum + p.quantity, 0) / points.length;
    const recentAvg = avg(last14);
    const priorAvg = avg(prior14);
    if (priorAvg <= 0) return 1;
    const ratio = recentAvg / priorAvg;
    return Math.min(1.3, Math.max(0.7, ratio));
  }
}
