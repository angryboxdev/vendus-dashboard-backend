import { InvalidConversionFactorError, InvalidCountedQuantityError } from "../errors.js";

export interface CountComponentQuantity {
  quantity: number;
  conversionFactor: number;
}

/**
 * `baseQuantity = quantity × conversionFactor`, calculado sempre no domínio
 * — nunca confiado ao cliente (secção 22 da task). Um item sem nenhuma
 * unidade alternativa configurada só aceita a unidade base diretamente
 * (`conversionFactor = 1`), sem bloquear o fluxo.
 */
export function toBaseQuantity(component: CountComponentQuantity): number {
  if (!Number.isFinite(component.quantity) || component.quantity < 0) {
    throw new InvalidCountedQuantityError("tem de ser um número não negativo e finito");
  }
  if (!Number.isFinite(component.conversionFactor) || component.conversionFactor <= 0) {
    throw new InvalidConversionFactorError(component.conversionFactor);
  }
  return component.quantity * component.conversionFactor;
}

/** Soma múltiplas unidades de contagem (ex: "saco" + "un" avulsas) sempre em unidade base. */
export function sumComponentsToBaseQuantity(components: CountComponentQuantity[]): number {
  return components.reduce((sum, c) => sum + toBaseQuantity(c), 0);
}
