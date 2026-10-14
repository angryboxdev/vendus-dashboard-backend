import type { LocationRating } from "../entities/google-reviews.js";

/** Média ponderada pelo número de avaliações (locais sem avaliações não pesam). */
export function weightedAverage(rows: Pick<LocationRating, "rating" | "userRatingCount">[]): { rating: number | null; count: number } {
  let sum = 0;
  let count = 0;
  for (const r of rows) {
    if (r.rating === null || !r.userRatingCount) continue;
    sum += r.rating * r.userRatingCount;
    count += r.userRatingCount;
  }
  return { rating: count ? Math.round((sum / count) * 10) / 10 : null, count };
}

/** Texto de pesquisa válido (3–120 caracteres). */
export function normalizeQuery(q: string): string | null {
  const t = q.trim().replace(/\s+/g, " ");
  return t.length >= 3 && t.length <= 120 ? t : null;
}
