import type { DishMargin } from "../entities/recipe-costing.js";

/**
 * Taxa de IVA das vendas por omissão (%): taxa intermédia, que a Vendus aplica aos pratos («INT»).
 * Cada empresa pode alterá-la nas definições das Fichas técnicas; validar com a contabilidade.
 */
export const DEFAULT_SALES_VAT_RATE = 13;

const round4 = (n: number) => Math.round(n * 10000) / 10000;

/**
 * Margem teórica de um prato num tamanho. O PVP inclui IVA; a margem compara o PVP sem IVA com o
 * custo s/ IVA. Só existe com custo completo e PVP > 0 — com um ingrediente sem preço o custo está
 * subavaliado e a margem seria falsa.
 */
export function computeDishMargin(input: {
  costWithoutVat: number;
  complete: boolean;
  salePrice: number | null;
  salesVatRate: number;
}): DishMargin | null {
  const { costWithoutVat, complete, salePrice, salesVatRate } = input;
  if (!complete || salePrice == null || salePrice <= 0) return null;
  const netSalePrice = salePrice / (1 + salesVatRate / 100);
  const marginWithoutVat = netSalePrice - costWithoutVat;
  return {
    netSalePrice: round4(netSalePrice),
    marginWithoutVat: round4(marginWithoutVat),
    marginRatio: round4(marginWithoutVat / netSalePrice),
    foodCostRatio: round4(costWithoutVat / netSalePrice),
  };
}
