export type UnitDimension = "mass" | "volume" | "count";

const UNIT_DIMENSIONS: Record<string, UnitDimension> = {
  g: "mass",
  kg: "mass",
  ml: "volume",
  l: "volume",
  cl: "volume",
  un: "count",
};

export interface ConversionValidationResult {
  flagged: boolean;
  reason: string | null;
}

/**
 * Nunca bloqueia — só sinaliza pares dimensionalmente suspeitos (ex: kg→L)
 * para revisão humana (secção 24 da task). Unidades desconhecidas (fora da
 * tabela) não são sinalizadas — evita falsos positivos sobre unidades que
 * este módulo ainda não conhece, em vez de assumir que são incompatíveis.
 */
export function validateConversion(purchaseUnit: string, stockBaseUnit: string): ConversionValidationResult {
  const purchaseDimension = UNIT_DIMENSIONS[purchaseUnit.toLowerCase()];
  const stockDimension = UNIT_DIMENSIONS[stockBaseUnit.toLowerCase()];
  if (!purchaseDimension || !stockDimension) {
    return { flagged: false, reason: null };
  }
  if (purchaseDimension !== stockDimension) {
    return {
      flagged: true,
      reason: `Conversão entre unidades de dimensões diferentes: "${purchaseUnit}" (${purchaseDimension}) → "${stockBaseUnit}" (${stockDimension})`,
    };
  }
  return { flagged: false, reason: null };
}
