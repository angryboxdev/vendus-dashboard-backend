import { dec, type Dec } from "../../../../kernel/money/decimal.js";
import { InvoicingRuleError } from "../errors.js";
import type { TaxRateCode, TaxRegion } from "../services/document-totals.service.js";

/**
 * Taxas de IVA em vigor por espaço fiscal (verificadas a 2026-11-03):
 * continente — CIVA art. 18.º, n.º 1; Açores e Madeira — Of.-Circ. 25045/2024
 * (anexo; Madeira reduzida 4 % desde 1-10-2024). Atualizar quando a lei mudar.
 */
export const VAT_RATES: Record<TaxRegion, Record<TaxRateCode, string>> = {
  PT: { RED: "6", INT: "13", NOR: "23" },
  "PT-AC": { RED: "4", INT: "9", NOR: "16" },
  "PT-MA": { RED: "4", INT: "12", NOR: "22" },
};

export function vatRate(region: TaxRegion, code: TaxRateCode): Dec {
  const pct = VAT_RATES[region]?.[code];
  if (!pct) throw new InvoicingRuleError(`Taxa de IVA desconhecida: ${region} ${code}`);
  return dec(pct);
}
