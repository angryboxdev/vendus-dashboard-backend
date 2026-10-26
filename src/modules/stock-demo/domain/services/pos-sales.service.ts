import type { PosDailySale, PosProduct } from "../entities/stock-demo.js";

/**
 * Simulador de vendas do POS fictício («CaixaFlow POS»). Puro e determinístico: a mesma semente, produto e dia
 * dão sempre as mesmas quantidades — reabrir um dia passado nunca muda o que já se mostrou.
 *
 * Receita do dia = alvo mensal × 12 ÷ 365 × peso do dia da semana (mais ao fim de semana) × ruído (±8%).
 * A receita reparte-se pelos produtos segundo um peso fixo por produto (alguns pratos vendem mais) e um ruído
 * diário (±20%); a quantidade é a parte da receita ÷ PVP, arredondada.
 */

/** Segunda → Domingo (getUTCDay: 0 = Domingo). */
const WEEKDAY_WEIGHT: Record<number, number> = { 1: 0.75, 2: 0.8, 3: 0.85, 4: 0.95, 5: 1.25, 6: 1.45, 0: 1.1 };
const AVG_WEEKDAY = Object.values(WEEKDAY_WEIGHT).reduce((s, w) => s + w, 0) / 7;

/** FNV-1a 32 bits. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Número em [0, 1) fixo para (semente, chave). */
export function unit(seed: number, key: string): number {
  let t = (hash(`${seed}|${key}`) + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Peso estável de um produto (0,5–2,0): os «campeões de venda» do cenário. */
export function productWeight(seed: number, reference: string): number {
  return 0.5 + 1.5 * unit(seed, `weight:${reference}`);
}

/** Receita alvo do dia (cêntimos, com IVA). */
export function dayRevenueCents(date: string, seed: number, monthlySalesTargetCents: number): number {
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
  const noise = 1 + (unit(seed, `day:${date}`) - 0.5) * 0.16;
  return ((monthlySalesTargetCents * 12) / 365) * (WEEKDAY_WEIGHT[dow]! / AVG_WEEKDAY) * noise;
}

export function simulateDailySales(
  products: PosProduct[],
  date: string,
  settings: { seed: number; monthlySalesTargetCents: number },
): PosDailySale[] {
  const sellable = products.filter((p) => p.priceCents > 0);
  if (sellable.length === 0) return [];
  const revenue = dayRevenueCents(date, settings.seed, settings.monthlySalesTargetCents);
  const weights = sellable.map((p) => productWeight(settings.seed, p.reference) * (0.8 + 0.4 * unit(settings.seed, `noise:${p.reference}:${date}`)));
  const total = weights.reduce((s, w) => s + w, 0);
  const out: PosDailySale[] = [];
  sellable.forEach((p, i) => {
    const quantity = Math.round((revenue * weights[i]!) / total / p.priceCents);
    if (quantity <= 0) return;
    out.push({ date, reference: p.reference, title: p.title, pizzaId: p.pizzaId, size: p.size, quantity, grossCents: quantity * p.priceCents });
  });
  return out;
}

/** Dias civis de `from` a `to` (inclusive), YYYY-MM-DD. */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = new Date(`${from}T12:00:00Z`); d <= new Date(`${to}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10));
  return out;
}
