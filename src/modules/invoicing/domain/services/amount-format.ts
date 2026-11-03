import { roundTo, type Dec } from "../../../../kernel/money/decimal.js";

/**
 * Montante com casas fixas, ponto decimal e sem separador de milhares — o
 * formato da assinatura, do QR e do SAF-T (ex.: 28.07, 0.80, 1234.50).
 */
export function formatAmount(d: Dec, decimals = 2): string {
  const r = roundTo(d, decimals);
  const neg = r.units < 0n;
  const digits = (neg ? -r.units : r.units).toString().padStart(decimals + 1, "0");
  const int = digits.slice(0, digits.length - decimals);
  const frac = digits.slice(digits.length - decimals);
  return `${neg ? "-" : ""}${int}${decimals > 0 ? `.${frac}` : ""}`;
}
