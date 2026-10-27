import type { DreParameters } from "../entities/dre-parameters.js";

export interface PlatformGross {
  /** Venda reconstituída, com IVA. */
  grossCents: number;
  /** Venda sem IVA. */
  netCents: number;
  /** IVA liquidado na venda. */
  salesVatCents: number;
  /** Comissão da plataforma, sem IVA (gasto) e o IVA dela (dedutível). */
  commissionNetCents: number;
  commissionVatCents: number;
  /** IVA do marketing (dedutível). */
  marketingVatCents: number;
}

/**
 * Venda bruta de uma plataforma a partir do que liquidou no banco. A plataforma retém a comissão
 * (com IVA por cima) e o marketing (com IVA), por isso: recebido = G − comissão·(1+t) − M·(1+m), com a
 * comissão = c·G (sobre a venda com IVA) ou c·G/(1+v) (sem IVA). Logo
 * G = (R + M·(1+m)) ÷ (1 − k), com k = c·(1+t) ou c·(1+t)/(1+v).
 *
 * Exemplo (c = 30%, t = 23%, v = 15%, sobre a venda com IVA): R = 631 €, M = 0 → G = 1000 €, sem IVA
 * 869,57 €, comissão 300 € + 69 € de IVA.
 */
export function platformGross(receivedCents: number, marketingNetCents: number, p: DreParameters): PlatformGross {
  const c = p.platformCommissionPct / 100;
  const t = p.platformCommissionVatPct / 100;
  const v = p.deliverySalesVatPct / 100;
  const m = p.marketingVatPct / 100;
  const k = p.commissionOnGross ? c * (1 + t) : (c * (1 + t)) / (1 + v);

  const gross = (receivedCents + marketingNetCents * (1 + m)) / (1 - k);
  const grossCents = Math.round(gross);
  const netCents = Math.round(gross / (1 + v));
  const commissionNetCents = Math.round(p.commissionOnGross ? c * gross : (c * gross) / (1 + v));
  return {
    grossCents,
    netCents,
    salesVatCents: grossCents - netCents,
    commissionNetCents,
    commissionVatCents: Math.round(commissionNetCents * t),
    marketingVatCents: Math.round(marketingNetCents * m),
  };
}
