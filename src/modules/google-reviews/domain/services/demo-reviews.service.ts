import type { PlaceReview } from "../entities/google-reviews.js";

/**
 * Avaliações Google FICTÍCIAS para a organização de demonstração (pedido do
 * utilizador, 2026-10-19, para apresentações). Determinísticas por local e
 * hora: a mesma página mostra sempre o mesmo, e ao longo do dia vão
 * «chegando» avaliações novas (uma oportunidade a cada 40 min por local).
 * Nunca usadas na organização real.
 */

const SLOT_MS = 40 * 60_000;
/** Início da história fictícia (o número de avaliações cresce desde aqui). */
const T0 = Date.parse("2026-01-01T00:00:00Z");

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

const AUTHORS = [
  "Marta S.", "João P.", "Inês R.", "Tiago M.", "Carla F.", "Rui A.", "Sofia L.", "Pedro C.", "Lucía G.", "Javier R.",
  "Ana B.", "Miguel T.", "Beatriz N.", "Hugo V.", "Rita D.", "Nuno G.", "Carmen M.", "Pablo O.", "Teresa Q.", "André E.",
];

const TEXTS: Record<number, string[]> = {
  5: [
    "Atendimento rápido e muito simpático. Voltarei com certeza!",
    "Equipa atenciosa e espaço sempre limpo. Recomendo.",
    "Excelente experiência, fomos muito bem recebidos.",
    "Serviço impecável do início ao fim.",
    "Muito bom! Tudo pronto a tempo e com qualidade.",
  ],
  4: [
    "Bom serviço, só tive de esperar um pouco à hora de almoço.",
    "Equipa simpática; o espaço podia ter mais lugares.",
    "Gostei bastante, preços justos.",
    "Boa experiência no geral, voltarei.",
  ],
  3: ["Correto, mas demorou mais do que o esperado.", "Serviço razoável; ao fim do dia estava cheio.", "Nada de especial, cumpriu."],
  2: ["Esperei bastante e ninguém me deu informação.", "Pouca gente a atender ao fim de semana."],
  1: ["Muito demorado e pouco organizado neste dia."],
};

const ratingOf = (h: number) => {
  const r = h % 100;
  return r < 52 ? 5 : r < 82 ? 4 : r < 93 ? 3 : r < 98 ? 2 : 1;
};

/** «há 12 minutos», «há 3 horas», «há 2 dias». */
export function relativeTimePt(atMs: number, nowMs: number): string {
  const min = Math.max(1, Math.round((nowMs - atMs) / 60_000));
  if (min < 60) return `há ${min} ${min === 1 ? "minuto" : "minutos"}`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} ${h === 1 ? "hora" : "horas"}`;
  const d = Math.round(h / 24);
  return `há ${d} ${d === 1 ? "dia" : "dias"}`;
}

/** Avaliação fictícia num intervalo de 40 min (ou null se nesse intervalo ninguém avaliou). */
function reviewAt(locationId: string, slot: number, nowMs: number): (PlaceReview & { at: number }) | null {
  const h = hash(`${locationId}|${slot}`);
  if (h % 100 >= 60) return null; // ~60% dos intervalos têm uma avaliação
  const at = T0 + slot * SLOT_MS + (h % 40) * 60_000;
  if (at > nowMs) return null;
  const rating = ratingOf(hash(`r|${locationId}|${slot}`));
  const texts = TEXTS[rating]!;
  return {
    at,
    author: AUTHORS[hash(`a|${locationId}|${slot}`) % AUTHORS.length]!,
    authorUri: null,
    rating,
    text: texts[hash(`t|${locationId}|${slot}`) % texts.length]!,
    relativeTime: relativeTimePt(at, nowMs),
    publishTime: new Date(at).toISOString(),
  };
}

/** As `n` avaliações fictícias mais recentes de um local, da mais nova para a mais antiga. */
export function demoReviews(locationId: string, nowMs: number, n = 5): PlaceReview[] {
  const out: PlaceReview[] = [];
  for (let slot = Math.floor((nowMs - T0) / SLOT_MS); slot >= 0 && out.length < n; slot--) {
    const r = reviewAt(locationId, slot, nowMs);
    if (r) {
      const { at: _at, ...review } = r;
      out.push(review);
    }
  }
  return out;
}

/** Nota e número de avaliações fictícios de um local (o número cresce com as avaliações novas). */
export function demoRating(locationId: string, nowMs: number): { rating: number; userRatingCount: number } {
  const h = hash(`base|${locationId}`);
  const base = 180 + (h % 260);
  const grown = Math.floor(((nowMs - T0) / SLOT_MS) * 0.6);
  const rating = Math.round((4.2 + ((h >>> 8) % 60) / 100) * 10) / 10; // 4,2–4,8
  return { rating, userRatingCount: base + grown };
}
