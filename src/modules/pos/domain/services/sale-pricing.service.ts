import { distribute } from "../../../../kernel/money/document-amounts.js";
import type { Discount, PosProduct } from "../entities/pos.js";
import { PosRuleError } from "../errors.js";

/**
 * Preços de uma venda do POS, em cêntimos com IVA (restauração: preço de
 * menu). Descontos por linha e na venda (% ou €); o da venda reparte-se pelas
 * linhas ao cêntimo. Para o motor de faturação, cada desconto vira uma
 * percentagem por linha com 6 casas, que reproduz o total da linha ao cêntimo.
 */
export interface PricedLine {
  product: PosProduct;
  quantity: number;
  grossCents: number;
  totalCents: number;
  /** Desconto da linha para o documento («12.345678»), ou null sem desconto. */
  discountPct: string | null;
}

export interface PricedSale {
  lines: PricedLine[];
  totalCents: number;
}

function discountCents(baseCents: number, d: Discount | undefined, what: string): number {
  if (!d || d.value === 0) return 0;
  if (!Number.isFinite(d.value) || d.value < 0) throw new PosRuleError(`${what}: desconto inválido`);
  if (d.kind === "pct") {
    if (d.value > 100) throw new PosRuleError(`${what}: desconto acima de 100 %`);
    return Math.round((baseCents * d.value) / 100);
  }
  const cents = Math.round(d.value * 100);
  if (cents > baseCents) throw new PosRuleError(`${what}: desconto maior do que o valor`);
  return cents;
}

/** (gross − total) × 100 ÷ gross, com 6 casas — sem vírgula flutuante. */
export function discountPctFor(grossCents: number, totalCents: number): string | null {
  if (totalCents === grossCents) return null;
  const scaled = (BigInt(grossCents - totalCents) * 100_000_000n * 2n + BigInt(grossCents)) / (2n * BigInt(grossCents));
  const s = scaled.toString().padStart(7, "0");
  return `${s.slice(0, -6)}.${s.slice(-6)}`.replace(/\.?0+$/, "") || "0";
}

export function priceSale(items: Array<{ product: PosProduct; quantity: number; discount?: Discount }>, saleDiscount?: Discount): PricedSale {
  if (items.length === 0) throw new PosRuleError("A venda não tem artigos");
  const nets = items.map((it, i) => {
    if (!Number.isInteger(it.quantity) || it.quantity < 1 || it.quantity > 999) throw new PosRuleError(`Linha ${i + 1}: quantidade inválida`);
    const gross = it.product.priceCents * it.quantity;
    return { gross, net: gross - discountCents(gross, it.discount, `Linha ${i + 1}`) };
  });
  const subtotal = nets.reduce((s, n) => s + n.net, 0);
  const saleCut = discountCents(subtotal, saleDiscount, "Desconto na venda");
  const cuts = saleCut > 0 ? distribute(saleCut, nets.map((n) => n.net)) : nets.map(() => 0);
  const lines = items.map((it, i) => {
    const totalCents = nets[i]!.net - cuts[i]!;
    return { product: it.product, quantity: it.quantity, grossCents: nets[i]!.gross, totalCents, discountPct: discountPctFor(nets[i]!.gross, totalCents) };
  });
  return { lines, totalCents: subtotal - saleCut };
}

/** Euros com 2 casas a partir de cêntimos («990» → «9.90»). */
export const centsToEuros = (cents: number) => `${Math.trunc(cents / 100)}.${String(Math.abs(cents % 100)).padStart(2, "0")}`;
