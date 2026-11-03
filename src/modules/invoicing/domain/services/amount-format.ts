import { roundTo, type Dec } from "../../../../kernel/money/decimal.js";

/**
 * Montante com 2 casas, ponto decimal e sem separador de milhares — o formato
 * da assinatura, do QR e do SAF-T (ex.: 28.07, 0.80, 1234.50).
 */
export function formatAmount(d: Dec): string {
  const r = roundTo(d, 2);
  const neg = r.units < 0n;
  const digits = (neg ? -r.units : r.units).toString().padStart(3, "0");
  return `${neg ? "-" : ""}${digits.slice(0, -2)}.${digits.slice(-2)}`;
}
